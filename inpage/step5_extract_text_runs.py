"""Step 5 - Extract UTF-16 text runs from candidate INP streams."""

from __future__ import annotations

import json
import unicodedata
from collections import defaultdict
from typing import Dict, List, Tuple

from step3_cfb_map import CfbFile


def is_allowed_codepoint(code: int) -> bool:
    if code in (0x0009, 0x000A, 0x000D, 0x200C, 0x200D, 0x200E, 0x200F):
        return True
    if 0x0020 <= code <= 0x007E:
        return True
    if 0x0600 <= code <= 0x06FF:
        return True
    if 0x0750 <= code <= 0x077F:
        return True
    if 0x08A0 <= code <= 0x08FF:
        return True
    if 0xFB50 <= code <= 0xFDFF:
        return True
    if 0xFE70 <= code <= 0xFEFF:
        return True
    if 0x0660 <= code <= 0x0669:
        return True
    if 0x06F0 <= code <= 0x06F9:
        return True
    return False


def confidence_for_text(text: str) -> float:
    if not text:
        return 0.0
    length = len(text)
    arabic = sum(1 for ch in text if "\u0600" <= ch <= "\u06ff" or "\ufb50" <= ch <= "\ufeff")
    printable = sum(1 for ch in text if ch.isprintable() or ch in "\n\r\t")
    score = 0.0
    score += min(length / 120.0, 1.0) * 0.25
    score += (arabic / length) * 0.55
    score += (printable / length) * 0.20
    return round(min(score, 1.0), 4)


def decode_run(codes: List[int]) -> str:
    text = "".join(chr(c) for c in codes)
    return unicodedata.normalize("NFC", text)


def extract_utf16_runs(data: bytes, min_chars: int = 6) -> List[Dict]:
    runs = []
    i = 0
    while i + 1 < len(data):
        code = data[i] | (data[i + 1] << 8)
        if is_allowed_codepoint(code):
            start = i
            codes = []
            while i + 1 < len(data):
                c = data[i] | (data[i + 1] << 8)
                if not is_allowed_codepoint(c):
                    break
                codes.append(c)
                i += 2
            if len(codes) >= min_chars:
                text = decode_run(codes).strip("\x00")
                if text:
                    runs.append(
                        {
                            "offset": start,
                            "length_bytes": len(codes) * 2,
                            "length_chars": len(text),
                            "decoded_text": text,
                            "confidence": confidence_for_text(text),
                        }
                    )
        else:
            i += 2
    return runs


def find_stream_bytes(cfb: CfbFile, stream_path: str) -> Tuple[bytes, str]:
    for entry in cfb.dir_entries:
        if cfb.paths_by_id.get(entry.entry_id) == stream_path:
            raw, _, alloc = cfb.read_dir_stream(entry)
            return raw, alloc
    return b"", "missing"


def main() -> None:
    with open("inpage/step4_stream_compare.json", "r", encoding="utf-8") as f:
        comp = json.load(f)

    candidate_by_file: Dict[str, List[str]] = defaultdict(list)
    for c in comp["candidate_streams"]:
        candidate_by_file[c["file"]].append(c["path"])

    out_files = []
    for file_path, paths in candidate_by_file.items():
        cfb = CfbFile(file_path)
        stream_items = []
        for path in sorted(set(paths)):
            data, alloc = find_stream_bytes(cfb, path)
            runs = extract_utf16_runs(data)
            stream_items.append(
                {
                    "path": path,
                    "allocation": alloc,
                    "size_bytes": len(data),
                    "run_count": len(runs),
                    "runs": runs,
                }
            )
        out_files.append({"file": file_path, "streams": stream_items})

    out = {"files": out_files}
    with open("inpage/step5_text_runs.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    lines = []
    lines.append("Step 5 UTF-16 Text Run Extraction")
    lines.append("=" * 80)
    for f in out_files:
        lines.append("")
        lines.append(f"FILE: {f['file']}")
        for s in f["streams"]:
            lines.append(
                f"  STREAM {s['path']} [{s['allocation']}] size={s['size_bytes']} runs={s['run_count']}"
            )
            for r in s["runs"][:20]:
                preview = r["decoded_text"].replace("\n", "\\n")
                if len(preview) > 100:
                    preview = preview[:100] + "..."
                lines.append(
                    f"    offset=0x{r['offset']:08X} bytes={r['length_bytes']} chars={r['length_chars']} conf={r['confidence']:.4f} text={preview}"
                )
            if s["run_count"] > 20:
                lines.append(f"    ... {s['run_count'] - 20} more runs")

    with open("inpage/step5_text_runs.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("Wrote inpage/step5_text_runs.json and inpage/step5_text_runs.txt")


if __name__ == "__main__":
    main()
