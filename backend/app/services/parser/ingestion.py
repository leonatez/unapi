"""
Step 1: Convert uploaded file → Markdown using markitdown (non-XLSX),
or list sheets for XLSX files (for user-driven sheet selection).

Also provides Gemini File API upload for the new native ingestion path.
"""
import logging
import os
import shutil
from pathlib import Path
from markitdown import MarkItDown
from app.core.config import get_settings
import google.generativeai as genai

logger = logging.getLogger(__name__)

_md = MarkItDown()
_gemini_initialized = False


def _init_gemini():
    global _gemini_initialized
    if not _gemini_initialized:
        s = get_settings()
        genai.configure(api_key=s.gemini_api_key)
        _gemini_initialized = True


def ingest_file(upload_path: str) -> str:
    """
    Convert any supported file to Markdown text (markitdown path).
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


def list_xlsx_sheets(file_path: str) -> list[dict]:
    """
    Read an XLSX file and return metadata for each sheet:
      { name, row_count, col_count, preview: [[cell, ...], ...] }
    Preview contains up to 6 rows (headers + first 5 data rows).
    Uses read_only mode to avoid loading images into memory.
    """
    import openpyxl
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    sheets = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        preview_rows = []
        row_count = 0
        col_count = 0
        for row in ws.iter_rows(values_only=True):
            # Skip fully empty rows
            if not any(cell is not None for cell in row):
                continue
            row_count += 1
            col_count = max(col_count, len(row))
            if len(preview_rows) < 6:
                preview_rows.append([str(c) if c is not None else "" for c in row])
        sheets.append({
            "name": sheet_name,
            "row_count": row_count,
            "col_count": col_count,
            "preview": preview_rows,
        })
    wb.close()
    return sheets


def xlsx_to_text(file_path: str, selected_sheets: list[str] | None = None) -> str:
    """
    Convert selected sheets of an XLSX file to a text representation
    suitable for passing to the LLM as prompt content.
    Each sheet is rendered as a markdown table.
    """
    import openpyxl
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    parts = []
    sheet_names = selected_sheets if selected_sheets else wb.sheetnames
    for name in sheet_names:
        if name not in wb.sheetnames:
            continue
        ws = wb[name]
        parts.append(f"\n## Sheet: {name}\n")
        rows = []
        for row in ws.iter_rows(values_only=True):
            if not any(cell is not None for cell in row):
                continue
            rows.append([str(c) if c is not None else "" for c in row])
        if not rows:
            parts.append("(empty)\n")
            continue
        # Render as markdown table
        col_count = max(len(r) for r in rows)
        header = rows[0] + [""] * (col_count - len(rows[0]))
        parts.append("| " + " | ".join(header) + " |")
        parts.append("| " + " | ".join(["---"] * col_count) + " |")
        for row in rows[1:]:
            padded = row + [""] * (col_count - len(row))
            parts.append("| " + " | ".join(padded) + " |")
        parts.append("")
    wb.close()
    return "\n".join(parts)


def upload_to_gemini(file_path: str) -> str:
    """
    Upload a file to the Gemini File API.
    Returns the file URI (e.g. 'files/abc123') for use in generate_content calls.
    """
    _init_gemini()
    logger.info("Uploading to Gemini File API: %s", file_path)
    uploaded = genai.upload_file(path=file_path)
    logger.info("Gemini upload complete: uri=%s name=%s", uploaded.uri, uploaded.name)
    return uploaded.uri
