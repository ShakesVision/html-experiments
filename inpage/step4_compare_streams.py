"""Step 4 - Compare stream inventories across INP samples."""

from __future__ import annotations

import json
from collections import defaultdict


def load_map(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def stream_key(entry: dict) -> str:
    return entry["path"]


def is_content_candidate(entry: dict) -> bool:
    path = entry["path"].lower()
    if "/inpage300" in path or "/documentinfo" in path:
        return True
    return False


def main() -> None:
    data = load_map("inpage/step3_ole_map.json")
    files = data["files"]
    if len(files) != 2:
        raise ValueError("Expected exactly two files in step3_ole_map.json")

    a, b = files[0], files[1]
    a_name = a["file"]
    b_name = b["file"]
    a_map = {stream_key(e): e for e in a["entries"] if e["type"] in ("stream", "root")}
    b_map = {stream_key(e): e for e in b["entries"] if e["type"] in ("stream", "root")}

    all_keys = sorted(set(a_map) | set(b_map))
    rows = []
    summary = defaultdict(int)

    for k in all_keys:
        ea = a_map.get(k)
        eb = b_map.get(k)
        if ea and eb:
            if ea["sha1"] == eb["sha1"] and ea["stream_size"] == eb["stream_size"]:
                status = "SAME"
            else:
                status = "DIFFERENT"
        elif ea:
            status = "ONLY_A"
        else:
            status = "ONLY_B"
        summary[status] += 1
        rows.append(
            {
                "path": k,
                "status": status,
                "a_size": ea["stream_size"] if ea else None,
                "b_size": eb["stream_size"] if eb else None,
                "a_sha1": ea["sha1"] if ea else "",
                "b_sha1": eb["sha1"] if eb else "",
                "candidate_content_stream": bool((ea and is_content_candidate(ea)) or (eb and is_content_candidate(eb))),
            }
        )

    # candidate list for next stages
    candidate_streams = []
    for k, e in sorted(a_map.items()):
        if is_content_candidate(e):
            candidate_streams.append({"file": a_name, "path": k, "size": e["stream_size"], "sha1": e["sha1"]})
    for k, e in sorted(b_map.items()):
        if is_content_candidate(e):
            candidate_streams.append({"file": b_name, "path": k, "size": e["stream_size"], "sha1": e["sha1"]})

    out = {
        "file_a": a_name,
        "file_b": b_name,
        "summary": dict(summary),
        "rows": rows,
        "candidate_streams": candidate_streams,
    }
    with open("inpage/step4_stream_compare.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    lines = []
    lines.append("Step 4 Stream-Level Comparison")
    lines.append("=" * 80)
    lines.append(f"A: {a_name}")
    lines.append(f"B: {b_name}")
    lines.append("")
    lines.append("Summary:")
    for k in ("SAME", "DIFFERENT", "ONLY_A", "ONLY_B"):
        lines.append(f"  {k:10}: {summary.get(k, 0)}")
    lines.append("")
    lines.append("Key candidate content streams:")
    for c in candidate_streams:
        lines.append(f"  {c['file']} :: {c['path']} (size={c['size']}, sha1={c['sha1'][:12]}...)")
    lines.append("")
    lines.append("Detailed rows:")
    lines.append("STATUS     | A_SIZE   | B_SIZE   | PATH")
    lines.append("-" * 80)
    for r in rows:
        lines.append(f"{r['status']:<10} | {str(r['a_size']):<8} | {str(r['b_size']):<8} | {r['path']}")

    with open("inpage/step4_stream_compare.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("Wrote inpage/step4_stream_compare.json and inpage/step4_stream_compare.txt")


if __name__ == "__main__":
    main()
