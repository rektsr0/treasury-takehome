from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NPM_COMMAND = "npm.cmd" if os.name == "nt" else "npm"


def run_build() -> None:
    completed = subprocess.run(
        [NPM_COMMAND, "run", "build"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert "vite build" in completed.stdout


def test_docs_build_uses_github_pages_asset_base() -> None:
    run_build()

    index_html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
    assert "/treasury-takehome/assets/" in index_html


def test_built_bundle_uses_pages_safe_tesseract_path() -> None:
    run_build()

    index_html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
    match = re.search(r'/treasury-takehome/assets/([^"]+\.js)', index_html)
    assert match, "Could not find the built JavaScript bundle in docs/index.html"

    bundle_path = ROOT / "docs" / "assets" / Path(match.group(1)).name
    bundle_text = bundle_path.read_text(encoding="utf-8")

    assert "/treasury-takehome/vendor/tesseract" in bundle_text
    assert '"/vendor/tesseract"' not in bundle_text
