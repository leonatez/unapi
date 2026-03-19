from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.parser.pipeline import ingest_to_markdown, extract_and_draft, persist_extraction
from app.core.database import get_db

router = APIRouter()


# ─── Upload: Phase 1 (markdown only, no AI) ────────────────────

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    owner: str = Form(..., description="Monee | Bank"),
    parser: str = Form("markitdown", description="Parser to use (markitdown)"),
):
    """
    Upload a document and convert to Markdown. No AI extraction yet.
    Returns { document_id, markdown } for user review.
    pipeline_status is set to 'markdown_ready'.
    """
    if owner not in ("Monee", "Bank"):
        raise HTTPException(400, "owner must be 'Monee' or 'Bank'")
    if parser not in ("markitdown",):
        raise HTTPException(400, "parser must be 'markitdown'")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, "Empty file")

    result = await ingest_to_markdown(file_bytes, file.filename, owner, parser)
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
    Run AI extraction on the document's current markdown.
    Stores result in extraction_draft, sets pipeline_status = 'extraction_review'.
    Returns the draft for user review.
    """
    db = get_db()
    doc = db.table("api_document").select("id, pipeline_status").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(404, "Document not found")

    try:
        draft = extract_and_draft(document_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
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
        raise HTTPException(400, str(e))
    except Exception as e:
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
