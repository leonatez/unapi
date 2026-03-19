from fastapi import APIRouter, HTTPException
from app.core.database import get_db

router = APIRouter()


@router.get("/")
def list_apis(document_id: str | None = None, exposed_by: str | None = None):
    db = get_db()
    q = db.table("api").select(
        "id, document_id, name, description, method, path, exposed_by, is_idempotent, confidence_score, created_at"
    )
    if document_id:
        q = q.eq("document_id", document_id)
    if exposed_by:
        q = q.eq("exposed_by", exposed_by)
    return q.order("name").execute().data


@router.get("/{api_id}")
def get_api(api_id: str):
    db = get_db()
    api = (
        db.table("api")
        .select("*, security_profile(*), api_message(*, api_field(*, api_field_enum(*)))")
        .eq("id", api_id)
        .single()
        .execute()
    )
    if not api.data:
        raise HTTPException(404, "API not found")
    return api.data


@router.get("/{api_id}/errors")
def get_api_errors(api_id: str):
    db = get_db()
    rows = (
        db.table("api_error")
        .select("*")
        .eq("api_id", api_id)
        .order("result_code")
        .execute()
    )
    return rows.data


@router.get("/{api_id}/edge-cases")
def get_api_edge_cases(api_id: str):
    db = get_db()
    rows = (
        db.table("edge_case")
        .select("*")
        .eq("api_id", api_id)
        .execute()
    )
    return rows.data
