"""
Step 1: Convert uploaded file → Markdown using markitdown.
Handles DOCX, XLSX (multi-sheet), PDF, MD.
"""
import os
import shutil
from pathlib import Path
from markitdown import MarkItDown
from app.core.config import get_settings

_md = MarkItDown()


def ingest_file(upload_path: str) -> str:
    """
    Convert any supported file to Markdown text.
    Returns the full Markdown string.
    """
    result = _md.convert(upload_path)
    return result.text_content


def save_upload(file_bytes: bytes, filename: str) -> str:
    """Persist the uploaded file and return its local path."""
    settings = get_settings()
    dest = os.path.join(settings.upload_dir, filename)
    with open(dest, "wb") as f:
        f.write(file_bytes)
    return dest
