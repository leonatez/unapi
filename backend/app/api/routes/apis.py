from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db

router = APIRouter()


# ─── Read ──────────────────────────────────────────────────────

@router.get("/")
def list_apis(document_id: str | None = None, exposed_by: str | None = None, flow_id: str | None = None):
    db = get_db()
    q = db.table("api").select(
        "id, flow_id, name, description, method, path, exposed_by, is_idempotent, confidence_score, created_at, flow(document_id)"
    )
    if flow_id:
        q = q.eq("flow_id", flow_id)
    elif document_id:
        # Join through flow to filter by document_id
        # Supabase PostgREST supports filtering on related tables
        q = q.eq("flow.document_id", document_id)
    if exposed_by:
        q = q.eq("exposed_by", exposed_by)
    return q.order("name").execute().data


@router.get("/{api_id}")
def get_api(api_id: str):
    db = get_db()
    result = (
        db.table("api")
        .select("*, security_profile(*), api_message(*, api_field(*, api_field_enum(*)))")
        .eq("id", api_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "API not found")
    return result.data


@router.get("/{api_id}/errors")
def get_api_errors(api_id: str):
    db = get_db()
    return db.table("api_error").select("*").eq("api_id", api_id).order("result_code").execute().data


@router.get("/{api_id}/edge-cases")
def get_api_edge_cases(api_id: str):
    db = get_db()
    return db.table("edge_case").select("*").eq("api_id", api_id).execute().data


# ─── Update API ────────────────────────────────────────────────

class UpdateApiBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    method: Optional[str] = None
    path: Optional[str] = None
    exposed_by: Optional[str] = None
    is_idempotent: Optional[bool] = None
    confidence_score: Optional[float] = None


@router.patch("/{api_id}")
def update_api(api_id: str, body: UpdateApiBody):
    db = get_db()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Nothing to update")
    if "exposed_by" in data and data["exposed_by"] not in ("Monee", "Bank"):
        raise HTTPException(400, "exposed_by must be Monee or Bank")
    row = db.table("api").update(data).eq("id", api_id).execute()
    if not row.data:
        raise HTTPException(404, "API not found")
    return row.data[0]


# ─── Fields ────────────────────────────────────────────────────

class CreateFieldBody(BaseModel):
    message_type: str  # "request" | "response"
    name: str
    description: Optional[str] = None
    data_type: Optional[str] = None
    max_length: Optional[int] = None
    is_required: bool = False
    default_value: Optional[str] = None
    constraints: Optional[str] = None
    is_encrypted: bool = False
    is_deprecated: bool = False
    parent_field_id: Optional[str] = None


class UpdateFieldBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    data_type: Optional[str] = None
    max_length: Optional[int] = None
    is_required: Optional[bool] = None
    default_value: Optional[str] = None
    constraints: Optional[str] = None
    is_encrypted: Optional[bool] = None
    is_deprecated: Optional[bool] = None
    confidence_score: Optional[float] = None


@router.post("/{api_id}/fields")
def create_field(api_id: str, body: CreateFieldBody):
    db = get_db()
    # Find or create the message for this api + message_type
    msgs = (
        db.table("api_message")
        .select("id")
        .eq("api_id", api_id)
        .eq("message_type", body.message_type)
        .execute()
        .data
    )
    if msgs:
        msg_id = msgs[0]["id"]
    else:
        msg_row = db.table("api_message").insert({
            "api_id": api_id,
            "message_type": body.message_type,
        }).execute()
        msg_id = msg_row.data[0]["id"]

    payload = body.model_dump(exclude={"message_type"})
    payload["message_id"] = msg_id
    row = db.table("api_field").insert(payload).execute()
    return row.data[0]


@router.patch("/{api_id}/fields/{field_id}")
def update_field(api_id: str, field_id: str, body: UpdateFieldBody):
    db = get_db()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Nothing to update")
    row = db.table("api_field").update(data).eq("id", field_id).execute()
    if not row.data:
        raise HTTPException(404, "Field not found")
    return row.data[0]


@router.delete("/{api_id}/fields/{field_id}", status_code=204)
def delete_field(api_id: str, field_id: str):
    db = get_db()
    db.table("api_field").delete().eq("id", field_id).execute()


# ─── Errors ────────────────────────────────────────────────────

class UpsertErrorBody(BaseModel):
    http_status: Optional[int] = None
    result_status: Optional[str] = None
    result_code: Optional[str] = None
    result_message: Optional[str] = None
    condition: Optional[str] = None
    confidence_score: Optional[float] = None


@router.post("/{api_id}/errors")
def create_error(api_id: str, body: UpsertErrorBody):
    db = get_db()
    payload = body.model_dump()
    payload["api_id"] = api_id
    row = db.table("api_error").insert(payload).execute()
    return row.data[0]


@router.patch("/{api_id}/errors/{error_id}")
def update_error(api_id: str, error_id: str, body: UpsertErrorBody):
    db = get_db()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "Nothing to update")
    row = db.table("api_error").update(data).eq("id", error_id).execute()
    if not row.data:
        raise HTTPException(404, "Error not found")
    return row.data[0]


@router.delete("/{api_id}/errors/{error_id}", status_code=204)
def delete_error(api_id: str, error_id: str):
    db = get_db()
    db.table("api_error").delete().eq("id", error_id).execute()
