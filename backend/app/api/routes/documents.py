import logging
import traceback
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.parser.pipeline import (
    ingest_to_markdown, confirm_sheet_selection,
    extract_and_draft, persist_extraction,
)
from app.core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Upload: Phase 1 ──────────────────────────────────────────
# XLSX  → returns { document_id, sheets, is_xlsx: true }
# Other → returns { document_id, markdown }

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    owner: str = Form(..., description="Monee | Bank"),
    parser: str = Form("markitdown", description="Parser to use (markitdown)"),
):
    """
    Upload a document.
    - XLSX: saves file, lists sheets for user selection.
      Returns { document_id, sheets: [{name, row_count, col_count, preview}], is_xlsx: true }.
      pipeline_status = 'pending_sheet_selection'.
    - Other: converts to Markdown, returns { document_id, markdown }.
      pipeline_status = 'markdown_ready'.
    """
    if owner not in ("Monee", "Bank"):
        raise HTTPException(400, "owner must be 'Monee' or 'Bank'")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, "Empty file")

    result = await ingest_to_markdown(file_bytes, file.filename, owner, parser)
    return result


# ─── Select sheets: Phase 1b (XLSX only) ──────────────────────

class SelectSheetsBody(BaseModel):
    selected_sheets: list[str]
    sheet_kinds: dict[str, str] = {}
    flow_sequence: dict[str, list[dict]] = {}


@router.post("/{document_id}/select-sheets")
def select_sheets(document_id: str, body: SelectSheetsBody):
    """
    Confirm sheet selection for an XLSX document.
    Uploads the raw file to Gemini File API, stores the URI and selected sheet names.
    Sets pipeline_status = 'file_ready'.
    Returns { status, gemini_file_uri }.
    """
    if not body.selected_sheets:
        raise HTTPException(400, "selected_sheets must not be empty")

    db = get_db()
    doc = (
        db.table("api_document")
        .select("id, pipeline_status")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not doc.data:
        raise HTTPException(404, "Document not found")
    if doc.data["pipeline_status"] != "pending_sheet_selection":
        raise HTTPException(400, f"Document is not awaiting sheet selection (status: {doc.data['pipeline_status']})")

    try:
        result = confirm_sheet_selection(
            document_id,
            body.selected_sheets,
            body.sheet_kinds or None,
            body.flow_sequence or None,
        )
    except ValueError as e:
        logger.warning("select-sheets validation error doc=%s: %s", document_id, e)
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(
            "select-sheets failed doc=%s\n%s",
            document_id,
            traceback.format_exc(),
        )
        raise HTTPException(500, f"Sheet selection failed: {e}")

    return result


# ─── Update markdown (resets pipeline) ────────────────────────

class UpdateMarkdownBody(BaseModel):
    markdown: str


@router.patch("/{document_id}/markdown")
def update_markdown(document_id: str, body: UpdateMarkdownBody):
    """
    Save edited markdown content. Resets pipeline_status to 'markdown_ready',
    clears any existing extraction_draft and deletes all flows/apis for this document.
    """
    db = get_db()
    doc = db.table("api_document").select("id").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(404, "Document not found")

    # Delete existing flows (cascades to apis, flow_steps)
    db.table("flow").delete().eq("document_id", document_id).execute()

    db.table("api_document").update({
        "markdown_content": body.markdown,
        "pipeline_status": "markdown_ready",
        "extraction_draft": None,
    }).eq("id", document_id).execute()

    return {"status": "ok", "pipeline_status": "markdown_ready"}


# ─── Extract: Phase 2 (AI extraction → draft) ─────────────────

@router.post("/{document_id}/extract")
def extract_document(document_id: str):
    """
    Run AI extraction on the document.
    Uses Gemini File API if gemini_file_uri is set (XLSX path),
    otherwise uses markdown content.
    Stores result in extraction_draft, sets pipeline_status = 'extraction_review'.
    Returns the draft for user review.
    """
    db = get_db()
    doc = db.table("api_document").select("id, pipeline_status").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(404, "Document not found")

    allowed = {"markdown_ready", "file_ready", "extraction_review"}
    if doc.data["pipeline_status"] not in allowed:
        raise HTTPException(400, f"Cannot extract from status: {doc.data['pipeline_status']}")

    try:
        draft = extract_and_draft(document_id)
    except ValueError as e:
        logger.warning("extract validation error doc=%s: %s", document_id, e)
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(
            "extract failed doc=%s\n%s",
            document_id,
            traceback.format_exc(),
        )
        raise HTTPException(500, f"Extraction failed: {e}")

    return {"status": "ok", "draft": draft}


# ─── Get extraction draft ──────────────────────────────────────

@router.get("/{document_id}/extraction")
def get_extraction(document_id: str):
    """Return the stored extraction_draft for review."""
    db = get_db()
    row = (
        db.table("api_document")
        .select("extraction_draft, pipeline_status")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(404, "Document not found")
    if not row.data.get("extraction_draft"):
        raise HTTPException(404, "No extraction draft available")
    return {
        "pipeline_status": row.data["pipeline_status"],
        "draft": row.data["extraction_draft"],
    }


# ─── Approve: Phase 3 (persist extraction) ────────────────────

@router.post("/{document_id}/approve")
def approve_extraction(document_id: str):
    """
    Persist the extraction_draft to flows/apis tables.
    Sets pipeline_status = 'complete', clears draft.
    Returns stats { flows, apis, edge_cases }.
    """
    db = get_db()
    doc = db.table("api_document").select("id").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(404, "Document not found")

    try:
        stats = persist_extraction(document_id)
    except ValueError as e:
        logger.warning("approve validation error doc=%s: %s", document_id, e)
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(
            "approve failed doc=%s\n%s",
            document_id,
            traceback.format_exc(),
        )
        raise HTTPException(500, f"Persist failed: {e}")

    return {"status": "ok", "document_id": document_id, **stats}


# ─── List / Get / Delete ───────────────────────────────────────

@router.get("/")
def list_documents():
    db = get_db()
    rows = (
        db.table("api_document")
        .select("id, name, owner, partner_name, flow_name, version, doc_date, raw_format, pipeline_status, parser, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return rows.data


@router.get("/{document_id}")
def get_document(document_id: str):
    db = get_db()
    row = (
        db.table("api_document")
        .select("*")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(404, "Document not found")
    return row.data


@router.delete("/{document_id}")
def delete_document(document_id: str):
    db = get_db()
    # diff_results don't cascade — delete manually
    db.table("diff_result").delete().eq("doc_a_id", document_id).execute()
    db.table("diff_result").delete().eq("doc_b_id", document_id).execute()
    # flow and api cascade from api_document (after migration 002)
    db.table("api_document").delete().eq("id", document_id).execute()
    return {"status": "deleted"}
