"""Shared sample file discovery for the InPage RE pipeline."""

from __future__ import annotations

import glob
import os
import re

INPAGE_DIR = os.path.dirname(os.path.abspath(__file__))

PARSER_THRESHOLDS = {
    "min_utf16_chars": 6,
    "min_legacy_bytes": 12,
    "content_confidence": 0.5,
    "arabic_char_min": 12,
    "page_gap_bytes": 0x8000,
    "footnote_body_max_chars": 100,
}


def discover_inp_files() -> list[str]:
    patterns = [
        os.path.join(INPAGE_DIR, "*.inp"),
        os.path.join(INPAGE_DIR, "..", "inpage", "*.inp"),
        "inpage/*.inp",
        "*.inp",
    ]
    found: list[str] = []
    seen = set()
    for pattern in patterns:
        for path in glob.glob(pattern):
            abspath = os.path.abspath(path)
            if abspath not in seen and os.path.isfile(abspath):
                seen.add(abspath)
                found.append(abspath)
    return sorted(found)


def find_content_stream_path(cfb) -> str | None:
    candidates: list[tuple[str, int]] = []
    for entry in cfb.dir_entries:
        path = cfb.paths_by_id.get(entry.entry_id, "")
        if entry.obj_type == 2 and re.fullmatch(r"/InPage\d+", path) and entry.stream_size > 0:
            candidates.append((path, entry.stream_size))
    if not candidates:
        return None
    for variant in ("300", "100"):
        for path, _size in candidates:
            if path == f"/InPage{variant}":
                return path
    return max(candidates, key=lambda item: item[1])[0]


def content_stream_variant(path: str | None) -> str:
    if not path:
        return "unknown"
    match = re.search(r"/InPage(\d+)$", path)
    return match.group(1) if match else "unknown"
