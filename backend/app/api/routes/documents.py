from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from app.services.parser.pipeline import process_document
from app.core.database import get_db

router = APIRouter()


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    owner: str = Form(..., description="Monee | Bank"),
):
    """
    Upload an API document (DOCX, XLSX, MD, PDF).
    Triggers the full parsing pipeline in the background.
    """
    if owner not in ("Monee", "Bank"):
        raise HTTPException(400, "owner must be 'Monee' or 'Bank'")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, "Empty file")

    # Run pipeline (could be slow — wrap in background for production)
    result = await process_document(file_bytes, file.filename, owner)
    return {"status": "ok", **result}


@router.get("/")
def list_documents():
    db = get_db()
    rows = (
        db.table("api_document")
        .select("id, name, owner, partner_name, flow_name, version, doc_date, raw_format, created_at")
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
    db.table("api_document").delete().eq("id", document_id).execute()
    return {"status": "deleted"}
