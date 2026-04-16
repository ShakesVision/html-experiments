"""Step 8 - Validation and determinism checks for current pipeline."""

from __future__ import annotations

import json
from hashlib import sha1
from pathlib import Path
import subprocess


ROOT = Path("inpage")


def file_sha1(path: Path) -> str:
    return sha1(path.read_bytes()).hexdigest()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    before = {}
    for p in (ROOT / "juz_29.ast.json", ROOT / "juz_30.ast.json"):
        if p.exists():
            before[p.name] = file_sha1(p)

    subprocess.run(["python", "inpage/inp_to_json.py"], check=True)
    after_first = {p.name: file_sha1(p) for p in (ROOT / "juz_29.ast.json", ROOT / "juz_30.ast.json")}
    subprocess.run(["python", "inpage/inp_to_json.py"], check=True)
    after_second = {p.name: file_sha1(p) for p in (ROOT / "juz_29.ast.json", ROOT / "juz_30.ast.json")}

    deterministic = after_first == after_second

    docs = []
    for name in ("juz_29.ast.json", "juz_30.ast.json"):
        p = ROOT / name
        doc = load_json(p)
        paragraph_count = sum(len(pg.get("paragraphs", [])) for pg in doc.get("pages", []))
        docs.append(
            {
                "file": name,
                "pages": len(doc.get("pages", [])),
                "paragraphs": paragraph_count,
                "styles": len(doc.get("styles", [])),
                "footnotes": len(doc.get("footnotes", [])),
            }
        )

    validation = {
        "deterministic_ast_output": deterministic,
        "hash_before": before,
        "hash_after_first": after_first,
        "hash_after_second": after_second,
        "documents": docs,
        "checks": {
            "ole_map_exists": (ROOT / "step3_ole_map.json").exists(),
            "text_runs_exists": (ROOT / "step5_text_runs.json").exists(),
            "structure_analysis_exists": (ROOT / "step6_structure_analysis.json").exists(),
            "model_hypotheses_exists": (ROOT / "step7_model_hypotheses.json").exists(),
            "reader_exists": (ROOT / "reader.html").exists(),
        },
        "known_gaps": [
            "Footnote mapping is heuristic and requires stronger anchor/body evidence.",
            "Style table fields are inferred from prefix clustering; semantic fields remain unknown.",
            "Page segmentation is deterministic but still heuristic until explicit page markers are decoded.",
        ],
    }

    out_json = ROOT / "step8_validation.json"
    with out_json.open("w", encoding="utf-8") as f:
        json.dump(validation, f, indent=2, ensure_ascii=False)

    lines = []
    lines.append("Step 8 Validation")
    lines.append("=" * 80)
    lines.append(f"Deterministic AST output: {validation['deterministic_ast_output']}")
    lines.append("")
    lines.append("Document stats:")
    for d in docs:
        lines.append(
            f"  {d['file']}: pages={d['pages']} paragraphs={d['paragraphs']} styles={d['styles']} footnotes={d['footnotes']}"
        )
    lines.append("")
    lines.append("Checks:")
    for k, v in validation["checks"].items():
        lines.append(f"  {k}: {v}")
    lines.append("")
    lines.append("Known gaps:")
    for g in validation["known_gaps"]:
        lines.append(f"  - {g}")

    out_txt = ROOT / "step8_validation.txt"
    out_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote {out_json} and {out_txt}")


if __name__ == "__main__":
    main()
