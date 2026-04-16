"""Step 6/7 - Structural marker analysis around extracted UTF-16 runs."""

from __future__ import annotations

import json
from collections import Counter
from typing import Dict, List

from step3_cfb_map import CfbFile


def find_entry_by_path(cfb: CfbFile, path: str):
    for entry in cfb.dir_entries:
        if cfb.paths_by_id.get(entry.entry_id) == path:
            return entry
    return None


def top_hex(counter: Counter, n: int = 20):
    return [{"hex": f"{k:02X}", "count": v} for k, v in counter.most_common(n)]


def main() -> None:
    with open("inpage/step5_text_runs.json", "r", encoding="utf-8") as f:
        runs_doc = json.load(f)

    results: List[Dict] = []
    token_hypotheses: List[Dict] = []

    for f in runs_doc["files"]:
        cfb = CfbFile(f["file"])
        file_entry = {"file": f["file"], "streams": []}
        for stream in f["streams"]:
            path = stream["path"]
            entry = find_entry_by_path(cfb, path)
            if not entry:
                continue
            data, _, _ = cfb.read_dir_stream(entry)

            before1 = Counter()
            before2 = Counter()
            after1 = Counter()
            after2 = Counter()
            boundary4 = Counter()

            for run in stream["runs"]:
                s = run["offset"]
                e = run["offset"] + run["length_bytes"]

                if s >= 1:
                    before1[data[s - 1]] += 1
                if s >= 2:
                    before2[data[s - 2] | (data[s - 1] << 8)] += 1
                if e < len(data):
                    after1[data[e]] += 1
                if e + 1 < len(data):
                    after2[data[e] | (data[e + 1] << 8)] += 1
                if s >= 2 and e + 1 < len(data):
                    seq = bytes(data[s - 2 : s] + data[e : e + 2])
                    boundary4[seq.hex()] += 1

            stream_result = {
                "path": path,
                "run_count": stream["run_count"],
                "top_before1": top_hex(before1),
                "top_before2": [{"hex": f"{k:04X}", "count": v} for k, v in before2.most_common(20)],
                "top_after1": top_hex(after1),
                "top_after2": [{"hex": f"{k:04X}", "count": v} for k, v in after2.most_common(20)],
                "top_boundary4": [{"hex": k, "count": v} for k, v in boundary4.most_common(20)],
            }
            file_entry["streams"].append(stream_result)

            # token hypotheses
            if path == "/InPage300":
                # frequent patterns in UTF-16 stream boundaries
                token_hypotheses.append(
                    {
                        "file": f["file"],
                        "stream": path,
                        "token": "PARAGRAPH_OR_RUN_BOUNDARY",
                        "evidence_hex": "000D / 000A around UTF-16 text run boundaries",
                        "confidence": 0.45,
                    }
                )
                token_hypotheses.append(
                    {
                        "file": f["file"],
                        "stream": path,
                        "token": "STYLE_OR_CONTROL_RECORD_PREFIX",
                        "evidence_hex": "high-frequency single-byte controls before text (e.g. 00/01/02 clusters)",
                        "confidence": 0.35,
                    }
                )

        results.append(file_entry)

    out = {"files": results, "token_hypotheses": token_hypotheses}
    with open("inpage/step6_structure_analysis.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    lines = []
    lines.append("Step 6/7 Structural Marker Analysis")
    lines.append("=" * 80)
    for f in results:
        lines.append("")
        lines.append(f"FILE: {f['file']}")
        for s in f["streams"]:
            lines.append(f"  STREAM {s['path']} runs={s['run_count']}")
            lines.append(f"    top_before2={s['top_before2'][:8]}")
            lines.append(f"    top_after2={s['top_after2'][:8]}")
            lines.append(f"    top_boundary4={s['top_boundary4'][:8]}")
    lines.append("")
    lines.append("Token Hypotheses:")
    for t in token_hypotheses:
        lines.append(
            f"  {t['file']} {t['stream']} => {t['token']} | evidence={t['evidence_hex']} | confidence={t['confidence']:.2f}"
        )

    with open("inpage/step6_structure_analysis.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("Wrote inpage/step6_structure_analysis.json and inpage/step6_structure_analysis.txt")


if __name__ == "__main__":
    main()
