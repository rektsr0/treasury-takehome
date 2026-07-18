from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SECRET_PATTERNS = [
    re.compile(r"github" r"_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"gh" r"p_[A-Za-z0-9]{20,}"),
    re.compile(r"s" r"k-[A-Za-z0-9]{20,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}"),
]

IGNORED_PREFIXES = (
    "docs/vendor/",
    "public/vendor/",
)


def tracked_files() -> list[Path]:
    completed = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [
        ROOT / line
        for line in completed.stdout.splitlines()
        if line and not line.startswith(IGNORED_PREFIXES)
    ]


def test_no_obvious_secret_patterns_in_tracked_files() -> None:
    for path in tracked_files():
        if not path.exists() or path.is_dir():
            continue

        text = path.read_text(encoding="utf-8", errors="ignore")
        for pattern in SECRET_PATTERNS:
            assert pattern.search(text) is None, f"Secret-like string found in {path}"
