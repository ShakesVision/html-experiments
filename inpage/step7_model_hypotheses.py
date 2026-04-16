"""Step 7/8/9/10 - Build provisional model hypotheses for style/font/footnotes/pages."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from typing import Dict, List, Tuple

from step3_cfb_map import CfbFile


ARABIC_INDIC_RE = re.compile(r"[\u0660-\u0669\u06F0-\u06F9]+")


def find_entry_by_path(cfb: CfbFile, path: str):
    for entry in cfb.dir_entries:
        if cfb.paths_by_id.get(entry.entry_id) == path:
            return entry
    return None


def extract_ascii_strings(data: bytes, min_len: int = 4) -> List[str]:
    patt = rb"[\x20-\x7E]{%d,}" % min_len
    return [m.decode("ascii", errors="ignore").strip() for m in re.findall(patt, data)]


def extract_utf16_latin_strings(data: bytes, min_len: int = 4) -> List[str]:
    out = []
    i = 0
    while i + 1 < len(data):
        chars = []
        start = i
        while i + 1 < len(data):
            code = data[i] | (data[i + 1] << 8)
            if 0x20 <= code <= 0x7E:
                chars.append(chr(code))
                i += 2
            else:
                break
        if len(chars) >= min_len:
            out.append("".join(chars))
        if i == start:
            i += 2
    return out


def norm_number_token(token: str) -> str:
    arabic_map = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
    return token.translate(arabic_map)


def build_style_table(stream_bytes: bytes, runs: List[Dict]) -> Tuple[List[Dict], Dict[int, str]]:
    prefix_counter = Counter()
    by_offset = {}
    for run in runs:
        off = run["offset"]
        start = max(0, off - 8)
        prefix = stream_bytes[start:off].hex()
        prefix_counter[prefix] += 1
        by_offset[off] = prefix

    style_table = []
    style_map = {}
    for idx, (prefix, count) in enumerate(prefix_counter.most_common(24), start=1):
        sid = f"S{idx:03d}"
        style_table.append(
            {
                "style_id": sid,
                "key_prefix_hex": prefix,
                "occurrences": count,
                "font_id": None,
                "font_size": None,
                "bold": None,
                "italic": None,
                "underline": None,
                "alignment": None,
                "confidence": round(min(0.3 + count / max(1, len(runs)) * 0.7, 0.95), 4),
            }
        )
        style_map[prefix] = sid
    run_style = {off: style_map.get(prefix, "S000") for off, prefix in by_offset.items()}
    return style_table, run_style


def derive_pages(arabic_runs: List[Dict]) -> List[List[Dict]]:
    if not arabic_runs:
        return []
    pages: List[List[Dict]] = []
    current = [arabic_runs[0]]
    for prev, nxt in zip(arabic_runs, arabic_runs[1:]):
        gap = nxt["offset"] - (prev["offset"] + prev["length_bytes"])
        heading = ("سُوْرَۃ" in nxt["decoded_text"]) or ("سورۃ" in nxt["decoded_text"])
        if gap > 0x8000 or heading:
            pages.append(current)
            current = [nxt]
        else:
            current.append(nxt)
    if current:
        pages.append(current)
    return pages


def main() -> None:
    with open("inpage/step5_text_runs.json", "r", encoding="utf-8") as f:
        text_runs_doc = json.load(f)

    out_files = []

    for f in text_runs_doc["files"]:
        file_path = f["file"]
        cfb = CfbFile(file_path)
        inpage_entry = find_entry_by_path(cfb, "/InPage300")
        inpage_data = b""
        if inpage_entry:
            inpage_data, _, _ = cfb.read_dir_stream(inpage_entry)

        all_runs = []
        for s in f["streams"]:
            if s["path"] == "/InPage300":
                all_runs.extend(s["runs"])
        all_runs.sort(key=lambda x: x["offset"])

        # style table from run prefixes
        style_table, run_style_map = build_style_table(inpage_data, all_runs)

        # font hypotheses from visible strings
        ascii_strings = extract_ascii_strings(inpage_data)
        latin_utf16_strings = extract_utf16_latin_strings(inpage_data)
        candidates = []
        keywords = ("nast", "noori", "nafees", "jameel", "alvi", "arial", "times", "tahoma", "urdu", "arabic")
        for s in ascii_strings + latin_utf16_strings:
            low = s.lower()
            if any(k in low for k in keywords):
                candidates.append(s)
        # fallback to top repeated named strings
        if not candidates:
            c = Counter(x for x in latin_utf16_strings if 3 <= len(x) <= 40)
            candidates = [k for k, _ in c.most_common(20)]
        font_candidates = sorted(set(candidates))[:40]

        # footnote mapping heuristic based on numeric markers
        marker_refs = []
        marker_bodies = []
        for run in all_runs:
            nums = [norm_number_token(m.group(0)) for m in ARABIC_INDIC_RE.finditer(run["decoded_text"])]
            if not nums:
                continue
            bucket = marker_refs if run["length_chars"] > 120 else marker_bodies
            for n in nums:
                bucket.append({"offset": run["offset"], "number": n, "text": run["decoded_text"][:140]})

        bodies_by_num = defaultdict(list)
        for b in marker_bodies:
            bodies_by_num[b["number"]].append(b)

        footnotes = []
        for ref in marker_refs:
            candidates_body = bodies_by_num.get(ref["number"], [])
            linked = candidates_body[0] if candidates_body else None
            footnotes.append(
                {
                    "number": ref["number"],
                    "reference_offset": ref["offset"],
                    "body_offset": linked["offset"] if linked else None,
                    "body_text_preview": linked["text"] if linked else "",
                    "confidence": 0.4 if linked else 0.2,
                }
            )
        # dedupe by (number, reference_offset)
        seen = set()
        dedup_footnotes = []
        for x in footnotes:
            k = (x["number"], x["reference_offset"])
            if k not in seen:
                seen.add(k)
                dedup_footnotes.append(x)

        # page segmentation on high-confidence Arabic runs
        arabic_runs = [r for r in all_runs if r["confidence"] >= 0.6]
        pages_raw = derive_pages(arabic_runs)
        pages = []
        for idx, runs in enumerate(pages_raw, start=1):
            paragraphs = []
            for r in runs:
                text = r["decoded_text"]
                parts = [p.strip() for p in text.splitlines() if p.strip()]
                if not parts:
                    parts = [text.strip()] if text.strip() else []
                for p in parts:
                    paragraphs.append(
                        {
                            "text": p,
                            "run_offset": r["offset"],
                            "style_id": run_style_map.get(r["offset"], "S000"),
                            "confidence": r["confidence"],
                        }
                    )
            pages.append(
                {
                    "page_number": idx,
                    "start_offset": runs[0]["offset"],
                    "end_offset": runs[-1]["offset"] + runs[-1]["length_bytes"],
                    "paragraph_count": len(paragraphs),
                    "paragraphs": paragraphs,
                }
            )

        out_files.append(
            {
                "file": file_path,
                "font_candidates": font_candidates,
                "styles": style_table,
                "footnote_hypotheses": dedup_footnotes[:400],
                "pages": pages,
                "stats": {
                    "all_runs": len(all_runs),
                    "high_conf_arabic_runs": len(arabic_runs),
                    "page_count": len(pages),
                    "style_count": len(style_table),
                },
            }
        )

    out = {"files": out_files}
    with open("inpage/step7_model_hypotheses.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    lines = []
    lines.append("Step 7/8/9/10 Model Hypotheses")
    lines.append("=" * 80)
    for f in out_files:
        lines.append("")
        lines.append(f"FILE: {f['file']}")
        lines.append(f"  stats={f['stats']}")
        lines.append(f"  font_candidates={f['font_candidates'][:20]}")
        lines.append("  top_styles:")
        for s in f["styles"][:8]:
            lines.append(
                f"    {s['style_id']} prefix={s['key_prefix_hex']} occ={s['occurrences']} conf={s['confidence']:.3f}"
            )
        lines.append("  page_boundaries:")
        for p in f["pages"][:12]:
            lines.append(
                f"    page={p['page_number']} offsets=0x{p['start_offset']:X}-0x{p['end_offset']:X} paragraphs={p['paragraph_count']}"
            )
        lines.append(f"  footnote_hypotheses={len(f['footnote_hypotheses'])}")
    with open("inpage/step7_model_hypotheses.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("Wrote inpage/step7_model_hypotheses.json and inpage/step7_model_hypotheses.txt")


if __name__ == "__main__":
    main()
