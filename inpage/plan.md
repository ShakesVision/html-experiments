# InPage Reverse-Engineering Progress Tracker

## Goal
Build a reproducible `.inp` reverse-engineering pipeline that extracts structured data (text, styles, pages, footnotes) into JSON AST and renders it in a minimal web reader.

## Known Findings
- Both `juz_29.inp` and `juz_30.inp` are OLE2/CFB files (`D0 CF 11 E0 A1 B1 1A E1`).
- `step1_recon.py` and `step1_output.txt` captured header/hex reconnaissance.
- `step2_ole_analysis.py` and `step2_output.txt` captured entropy and UTF-16 heuristics.
- `olefile` dependency was unavailable during prior analysis, so stream-level introspection was not completed.

## Actionable Todos
| ID | Task | Owner | Status | Date | Evidence |
|---|---|---|---|---|---|
| T01 | Create plan tracker and backfill Step 1/2 progress | Codex | Done | 2026-04-15 | `inpage/plan.md`, `inpage/step1_output.txt`, `inpage/step2_output.txt` |
| T02 | Implement Step 3 CFB parser (header/FAT/miniFAT/directory/chains) | Codex | Done | 2026-04-15 | `inpage/step3_cfb_map.py` |
| T03 | Produce `step3_ole_map.txt` and `step3_ole_map.json` for both samples | Codex | Done | 2026-04-15 | `inpage/step3_ole_map.txt`, `inpage/step3_ole_map.json` |
| T04 | Compare streams between samples (stable vs variable) | Codex | Done | 2026-04-15 | `inpage/step4_compare_streams.py`, `inpage/step4_stream_compare.txt`, `inpage/step4_stream_compare.json` |
| T05 | Build focused UTF-16/Unicode extractor on candidate streams | Codex | Done | 2026-04-15 | `inpage/step5_extract_text_runs.py`, `inpage/step5_text_runs.json`, `inpage/step5_text_runs.txt` |
| T06 | Normalize decoding and avoid mojibake in outputs | Codex | Done | 2026-04-15 | `inpage/step5_text_runs.json` |
| T07 | Propose structural markers (paragraph/page/footnote/style boundaries) | Codex | Done | 2026-04-15 | `inpage/step6_structure_analysis.py`, `inpage/step6_structure_analysis.txt` |
| T08 | Build provisional font/style hypothesis | Codex | Done | 2026-04-15 | `inpage/step7_model_hypotheses.py`, `inpage/step7_model_hypotheses.json` |
| T09 | Build provisional footnote mapping hypothesis | Codex | Done | 2026-04-15 | `inpage/step7_model_hypotheses.json` |
| T10 | Build deterministic page segmentation model | Codex | Done | 2026-04-15 | `inpage/step7_model_hypotheses.json` |
| T11 | Implement `inp_to_json.py` with stable AST | Codex | Done | 2026-04-15 | `inpage/inp_to_json.py`, `inpage/juz_29.ast.json`, `inpage/juz_30.ast.json`, `inpage/inp_ast_index.json` |
| T12 | Build minimal browser reader for AST | Codex | Done | 2026-04-15 | `inpage/reader.html` |
| T13 | Validate both samples + determinism and update gaps | Codex | Done | 2026-04-15 | `inpage/step8_validate.py`, `inpage/step8_validation.txt`, `inpage/step8_validation.json` |

## Completed
- Step 1 binary reconnaissance completed.
- Step 2 entropy + initial text-region detection completed.
- Step 3 CFB parser and stream manifest generation completed.
- Step 4 stream-level cross-file comparison completed.
- Step 5 focused UTF-16 run extraction completed.
- Step 6 structural marker correlation completed.
- Step 7/8/9/10 provisional model hypotheses completed.
- `inp_to_json.py` AST export completed for both samples.
- Browser reader prototype completed.
- Determinism and pipeline validation completed.

## Open Questions
- Exact internal stream naming and role mapping (text/style/footnotes/pages).
- Exact style record schema and page boundary markers.
- Footnote anchor/body linkage remains heuristic and needs stronger byte-level evidence.

## Evidence Links
- `inpage/step1_recon.py`
- `inpage/step1_output.txt`
- `inpage/step2_ole_analysis.py`
- `inpage/step2_output.txt`
- `inpage/step3_cfb_map.py`
- `inpage/step3_ole_map.txt`
- `inpage/step3_ole_map.json`
- `inpage/step4_compare_streams.py`
- `inpage/step4_stream_compare.txt`
- `inpage/step4_stream_compare.json`
- `inpage/step5_extract_text_runs.py`
- `inpage/step5_text_runs.txt`
- `inpage/step5_text_runs.json`
- `inpage/step6_structure_analysis.py`
- `inpage/step6_structure_analysis.txt`
- `inpage/step6_structure_analysis.json`
- `inpage/step7_model_hypotheses.py`
- `inpage/step7_model_hypotheses.txt`
- `inpage/step7_model_hypotheses.json`
- `inpage/inp_to_json.py`
- `inpage/juz_29.ast.json`
- `inpage/juz_30.ast.json`
- `inpage/inp_ast_index.json`
- `inpage/reader.html`
- `inpage/step8_validate.py`
- `inpage/step8_validation.txt`
- `inpage/step8_validation.json`
