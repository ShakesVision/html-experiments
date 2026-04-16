"""Step 3 - CFB/OLE map extraction without third-party dependencies.

Parses:
- Header
- DIFAT/FAT
- Directory entries
- miniFAT
- Stream allocation chains

Outputs:
- inpage/step3_ole_map.json
- inpage/step3_ole_map.txt
"""

from __future__ import annotations

import json
import os
import struct
from dataclasses import dataclass
from hashlib import sha1
from typing import Dict, List, Tuple


FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE
FATSECT = 0xFFFFFFFD
DIFSECT = 0xFFFFFFFC
NOSTREAM = 0xFFFFFFFF


def u16(data: bytes, off: int) -> int:
    return struct.unpack_from("<H", data, off)[0]


def u32(data: bytes, off: int) -> int:
    return struct.unpack_from("<I", data, off)[0]


def u64(data: bytes, off: int) -> int:
    return struct.unpack_from("<Q", data, off)[0]


@dataclass
class DirEntry:
    entry_id: int
    name: str
    obj_type: int
    color: int
    left_id: int
    right_id: int
    child_id: int
    start_sector: int
    stream_size: int

    @property
    def type_name(self) -> str:
        return {0: "unknown", 1: "storage", 2: "stream", 5: "root"}.get(self.obj_type, f"type_{self.obj_type}")


class CfbFile:
    def __init__(self, path: str):
        self.path = path
        with open(path, "rb") as f:
            self.data = f.read()
        self.header = self._parse_header()
        self.sector_size = 1 << self.header["sector_shift"]
        self.mini_sector_size = 1 << self.header["mini_sector_shift"]
        self.fat: List[int] = []
        self.minifat: List[int] = []
        self.dir_entries: List[DirEntry] = []
        self.paths_by_id: Dict[int, str] = {}
        self.root_entry: DirEntry | None = None

        self._load_fat()
        self._load_directory()
        self._build_paths()
        self._load_minifat()

    def _parse_header(self) -> Dict[str, int]:
        d = self.data[:512]
        if d[:8] != b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1":
            raise ValueError(f"{self.path} is not a CFB file")
        return {
            "minor_version": u16(d, 24),
            "major_version": u16(d, 26),
            "byte_order": u16(d, 28),
            "sector_shift": u16(d, 30),
            "mini_sector_shift": u16(d, 32),
            "num_dir_sectors": u32(d, 40),
            "num_fat_sectors": u32(d, 44),
            "first_dir_sector": u32(d, 48),
            "transaction_signature": u32(d, 52),
            "mini_stream_cutoff_size": u32(d, 56),
            "first_minifat_sector": u32(d, 60),
            "num_minifat_sectors": u32(d, 64),
            "first_difat_sector": u32(d, 68),
            "num_difat_sectors": u32(d, 72),
        }

    def _sector_offset(self, sid: int) -> int:
        return (sid + 1) * self.sector_size

    def _read_sector(self, sid: int) -> bytes:
        off = self._sector_offset(sid)
        return self.data[off : off + self.sector_size]

    def _read_chain(self, start_sid: int, table: List[int], max_steps: int = 10_000) -> List[int]:
        if start_sid in (NOSTREAM, ENDOFCHAIN):
            return []
        chain = []
        sid = start_sid
        seen = set()
        for _ in range(max_steps):
            if sid in (NOSTREAM, ENDOFCHAIN):
                break
            if sid >= len(table):
                break
            if sid in seen:
                break
            seen.add(sid)
            chain.append(sid)
            sid = table[sid]
        return chain

    def _load_fat(self) -> None:
        difat = []
        header_difat = self.data[76 : 76 + 109 * 4]
        for i in range(0, len(header_difat), 4):
            sid = struct.unpack_from("<I", header_difat, i)[0]
            if sid != FREESECT:
                difat.append(sid)

        next_difat_sid = self.header["first_difat_sector"]
        for _ in range(self.header["num_difat_sectors"]):
            if next_difat_sid in (ENDOFCHAIN, FREESECT, NOSTREAM):
                break
            sec = self._read_sector(next_difat_sid)
            count = (self.sector_size // 4) - 1
            for i in range(count):
                sid = struct.unpack_from("<I", sec, i * 4)[0]
                if sid != FREESECT:
                    difat.append(sid)
            next_difat_sid = struct.unpack_from("<I", sec, self.sector_size - 4)[0]

        fat = []
        for fat_sid in difat:
            fat_sec = self._read_sector(fat_sid)
            for i in range(0, self.sector_size, 4):
                fat.append(struct.unpack_from("<I", fat_sec, i)[0])
        self.fat = fat

    def _load_directory(self) -> None:
        chain = self._read_chain(self.header["first_dir_sector"], self.fat)
        dbytes = b"".join(self._read_sector(sid) for sid in chain)
        entries = []
        for idx in range(0, len(dbytes), 128):
            ent = dbytes[idx : idx + 128]
            if len(ent) < 128:
                continue
            name_len = u16(ent, 64)
            name_raw = ent[: max(0, name_len - 2)]
            try:
                name = name_raw.decode("utf-16le", errors="ignore")
            except Exception:
                name = ""
            de = DirEntry(
                entry_id=idx // 128,
                name=name,
                obj_type=ent[66],
                color=ent[67],
                left_id=u32(ent, 68),
                right_id=u32(ent, 72),
                child_id=u32(ent, 76),
                start_sector=u32(ent, 116),
                stream_size=u64(ent, 120),
            )
            entries.append(de)
        self.dir_entries = entries
        if entries:
            self.root_entry = entries[0]

    def _walk_sibling_tree(self, node_id: int, collector: List[int]) -> None:
        if node_id in (NOSTREAM, FREESECT) or node_id >= len(self.dir_entries):
            return
        node = self.dir_entries[node_id]
        self._walk_sibling_tree(node.left_id, collector)
        collector.append(node_id)
        self._walk_sibling_tree(node.right_id, collector)

    def _build_paths(self) -> None:
        if not self.root_entry:
            return
        self.paths_by_id[self.root_entry.entry_id] = "/"

        def assign_children(parent_id: int, parent_path: str) -> None:
            parent = self.dir_entries[parent_id]
            nodes: List[int] = []
            self._walk_sibling_tree(parent.child_id, nodes)
            for nid in nodes:
                name = self.dir_entries[nid].name or f"entry_{nid}"
                if parent_path == "/":
                    path = f"/{name}"
                else:
                    path = f"{parent_path}/{name}"
                self.paths_by_id[nid] = path
                if self.dir_entries[nid].obj_type in (1, 5):
                    assign_children(nid, path)

        assign_children(self.root_entry.entry_id, "/")

    def _load_minifat(self) -> None:
        start = self.header["first_minifat_sector"]
        chain = self._read_chain(start, self.fat)
        mini = []
        for sid in chain:
            sec = self._read_sector(sid)
            for i in range(0, len(sec), 4):
                mini.append(struct.unpack_from("<I", sec, i)[0])
        self.minifat = mini

    def _read_normal_stream(self, start_sector: int, size: int) -> Tuple[bytes, List[int]]:
        chain = self._read_chain(start_sector, self.fat)
        raw = b"".join(self._read_sector(sid) for sid in chain)
        return raw[:size], chain

    def _read_mini_stream(self, start_mini_sector: int, size: int) -> Tuple[bytes, List[int]]:
        if not self.root_entry:
            return b"", []
        root_bytes, _ = self._read_normal_stream(self.root_entry.start_sector, self.root_entry.stream_size)
        chain = self._read_chain(start_mini_sector, self.minifat)
        parts = []
        for msid in chain:
            off = msid * self.mini_sector_size
            parts.append(root_bytes[off : off + self.mini_sector_size])
        return b"".join(parts)[:size], chain

    def read_dir_stream(self, entry: DirEntry) -> Tuple[bytes, List[int], str]:
        cutoff = self.header["mini_stream_cutoff_size"]
        if entry.obj_type not in (2, 5):
            return b"", [], "none"
        if entry.obj_type == 5:
            raw, chain = self._read_normal_stream(entry.start_sector, entry.stream_size)
            return raw, chain, "fat"
        if entry.stream_size < cutoff:
            raw, chain = self._read_mini_stream(entry.start_sector, entry.stream_size)
            return raw, chain, "minifat"
        raw, chain = self._read_normal_stream(entry.start_sector, entry.stream_size)
        return raw, chain, "fat"

    def stream_manifest(self) -> Dict:
        entries = []
        for ent in self.dir_entries:
            path = self.paths_by_id.get(ent.entry_id, f"/entry_{ent.entry_id}")
            stream_data = b""
            chain: List[int] = []
            alloc = "none"
            if ent.obj_type in (2, 5):
                stream_data, chain, alloc = self.read_dir_stream(ent)
            sample = stream_data[:64]
            entries.append(
                {
                    "entry_id": ent.entry_id,
                    "path": path,
                    "name": ent.name,
                    "type": ent.type_name,
                    "start_sector": ent.start_sector,
                    "stream_size": ent.stream_size,
                    "allocation": alloc,
                    "chain_len": len(chain),
                    "chain_head": chain[:16],
                    "sha1": sha1(stream_data).hexdigest() if stream_data else "",
                    "sample_hex": sample.hex(),
                }
            )
        return {
            "file": self.path,
            "size_bytes": len(self.data),
            "header": self.header,
            "sector_size": self.sector_size,
            "mini_sector_size": self.mini_sector_size,
            "fat_entries": len(self.fat),
            "minifat_entries": len(self.minifat),
            "directory_entries": len(self.dir_entries),
            "entries": entries,
        }


def write_outputs(results: List[Dict], out_json: str, out_txt: str) -> None:
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({"files": results}, f, indent=2, ensure_ascii=False)

    lines: List[str] = []
    lines.append("Step 3 CFB/OLE Map")
    lines.append("=" * 80)
    for r in results:
        lines.append("")
        lines.append(f"FILE: {r['file']}")
        lines.append(f"SIZE: {r['size_bytes']:,} bytes")
        lines.append(
            f"SECTOR_SIZE={r['sector_size']} MINI_SECTOR_SIZE={r['mini_sector_size']} FAT_ENTRIES={r['fat_entries']}"
        )
        lines.append(f"DIRECTORY_ENTRIES={r['directory_entries']} MINIFAT_ENTRIES={r['minifat_entries']}")
        lines.append("Entries:")
        lines.append("  ID | TYPE    | ALLOC   | SIZE     | CHAIN | PATH")
        lines.append("  " + "-" * 72)
        for e in r["entries"]:
            lines.append(
                f"  {e['entry_id']:>2} | {e['type']:<7} | {e['allocation']:<7} | {e['stream_size']:>8} | {e['chain_len']:>5} | {e['path']}"
            )
        lines.append("")
        lines.append("Stream Samples (first 64 bytes hex):")
        for e in r["entries"]:
            if e["type"] in ("stream", "root"):
                lines.append(f"  [{e['entry_id']:>2}] {e['path']} :: {e['sample_hex']}")

    with open(out_txt, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main() -> None:
    files = ["inpage/juz_29.inp", "inpage/juz_30.inp"]
    results = []
    for fp in files:
        if not os.path.exists(fp):
            raise FileNotFoundError(fp)
        cfb = CfbFile(fp)
        results.append(cfb.stream_manifest())
    write_outputs(results, "inpage/step3_ole_map.json", "inpage/step3_ole_map.txt")
    print("Wrote inpage/step3_ole_map.json and inpage/step3_ole_map.txt")


if __name__ == "__main__":
    main()
