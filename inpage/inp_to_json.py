"""Convert current reverse-engineering hypotheses into stable AST JSON outputs."""

from __future__ import annotations

import json
import os
from hashlib import sha1
from typing import Dict, List


def safe_name(path: str) -> str:
    base = os.path.basename(path)
    stem, _ = os.path.splitext(base)
    return stem


def build_document_ast(file_item: Dict) -> Dict:
    pages = []
    for p in file_item["pages"]:
        paragraphs = []
        runs_out = []
        for para_idx, para in enumerate(p["paragraphs"], start=1):
            run = {
                "text": para["text"],
                "source": {
                    "stream": "/InPage300",
                    "offset": para["run_offset"],
                    "confidence": para["confidence"],
                },
                "style_id": para["style_id"],
                "char_format": {
                    "font": None,
                    "size": None,
                    "bold": None,
                    "italic": None,
                    "underline": None,
                    "color": None,
                },
            }
            runs_out.append(run)
            paragraphs.append(
                {
                    "paragraph_id": f"p{p['page_number']}_{para_idx}",
                    "alignment": None,
                    "indentation": None,
                    "spacing": None,
                    "direction": "rtl",
                    "runs": [run],
                }
            )

        pages.append(
            {
                "number": p["page_number"],
                "source_offsets": {"start": p["start_offset"], "end": p["end_offset"]},
                "paragraphs": paragraphs,
                "runs": runs_out,
            }
        )

    footnotes = []
    for i, fn in enumerate(file_item["footnote_hypotheses"], start=1):
        footnotes.append(
            {
                "id": f"fn{i}",
                "number": fn["number"],
                "reference_offset": fn["reference_offset"],
                "body_offset": fn["body_offset"],
                "body_text_preview": fn["body_text_preview"],
                "confidence": fn["confidence"],
            }
        )

    return {
        "metadata": {
            "source_file": file_item["file"],
            "generator": "inp_to_json.py",
            "schema_version": "0.1.0",
            "status": "reverse_engineering_provisional",
        },
        "fonts": [{"font_id": f"F{i+1:03d}", "name": name} for i, name in enumerate(file_item["font_candidates"])],
        "styles": file_item["styles"],
        "pages": pages,
        "footnotes": footnotes,
    }


def main() -> None:
    with open("inpage/step7_model_hypotheses.json", "r", encoding="utf-8") as f:
        model = json.load(f)

    index = {"documents": []}
    for file_item in model["files"]:
        ast = build_document_ast(file_item)
        name = safe_name(file_item["file"])
        out_path = f"inpage/{name}.ast.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(ast, f, indent=2, ensure_ascii=False)
        with open(out_path, "rb") as f:
            digest = sha1(f.read()).hexdigest()
        index["documents"].append(
            {
                "source_file": file_item["file"],
                "ast_file": out_path,
                "sha1": digest,
                "page_count": len(ast["pages"]),
                "footnote_count": len(ast["footnotes"]),
                "style_count": len(ast["styles"]),
            }
        )

    with open("inpage/inp_ast_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print("Wrote AST files and inpage/inp_ast_index.json")


if __name__ == "__main__":
    main()
