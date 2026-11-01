"""Compatibility entry point: one offline generator, no mutation of catalog. See CARD-RESOURCES.md."""
from runpy import run_path
from pathlib import Path
run_path(str(Path(__file__).with_name("build-card-resources.py")),run_name="__main__")
