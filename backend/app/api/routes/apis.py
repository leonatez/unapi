import logging
import traceback
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.services.parser.llm_extractor import reextract_api
from app.services.parser.pipeline import _persist_fields, _persist_edge_case

logger = logging.getLogger(__name__)

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
    value_logic: Optional[str] = None
    is_encrypted: bool = False
    is_deprecated: bool = False
    parent_field_id: Optional[str] = None
    document_variable_id: Optional[str] = None


class UpdateFieldBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    data_type: Optional[str] = None
    max_length: Optional[int] = None
    is_required: Optional[bool] = None
    default_value: Optional[str] = None
    constraints: Optional[str] = None
    value_logic: Optional[str] = None
    is_encrypted: Optional[bool] = None
    is_deprecated: Optional[bool] = None
    confidence_score: Optional[float] = None
    document_variable_id: Optional[str] = None


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


# ─── AI Re-extraction ──────────────────────────────────────────

@router.post("/{api_id}/reextract")
async def reextract_api_endpoint(
    api_id: str,
    files: list[UploadFile] = File(...),
):
    """
    Re-extract a single API's spec from uploaded screenshots (.png/.jpg/.webp)
    and/or markdown files (.md/.txt).

    Replaces all request/response fields, errors, and edge cases for this API.
    Returns the updated ApiDef.
    """
    db = get_db()

    # Fetch existing API for context
    api_row = (
        db.table("api")
        .select("id, name, method, path, exposed_by, flow_id")
        .eq("id", api_id)
        .single()
        .execute()
    )
    if not api_row.data:
        raise HTTPException(404, "API not found")
    api_data = api_row.data

    # Read uploaded files
    file_inputs: list[tuple[bytes, str]] = []
    for f in files:
        content = await f.read()
        mime = f.content_type or "application/octet-stream"
        # Normalise markdown mime types
        if f.filename and f.filename.endswith((".md", ".markdown")):
            mime = "text/markdown"
        elif f.filename and f.filename.endswith(".txt"):
            mime = "text/plain"
        file_inputs.append((content, mime))

    if not file_inputs:
        raise HTTPException(400, "No files provided")

    # Run AI extraction
    try:
        result = reextract_api(
            api_name=api_data["name"],
            method=api_data.get("method"),
            path=api_data.get("path"),
            exposed_by=api_data.get("exposed_by", "Monee"),
            files=file_inputs,
        )
    except Exception as e:
        logger.error("reextract failed api=%s\n%s", api_id, traceback.format_exc())
        raise HTTPException(500, f"AI extraction failed: {e}")

    if result.get("_error"):
        raise HTTPException(500, f"AI extraction failed: {result['_error']}")

    # Replace request/response messages + fields
    existing_msgs = (
        db.table("api_message")
        .select("id, message_type")
        .eq("api_id", api_id)
        .in_("message_type", ["request", "response", "request_header", "response_header"])
        .execute()
        .data
    )
    msg_id_map: dict[str, str] = {}
    for msg in existing_msgs:
        msg_id_map[msg["message_type"]] = msg["id"]
        # Delete all existing fields for this message
        db.table("api_field").delete().eq("message_id", msg["id"]).execute()

    for msg_type in ("request_header", "request", "response_header", "response"):
        msg_data = result.get(msg_type, {})
        if not msg_data:
            continue
        fields = msg_data.get("fields", [])
        example = msg_data.get("example_json")

        if msg_type in msg_id_map:
            msg_id = msg_id_map[msg_type]
            if example is not None:
                db.table("api_message").update({"example_json": example}).eq("id", msg_id).execute()
        else:
            msg_row = db.table("api_message").insert({
                "api_id": api_id,
                "message_type": msg_type,
                "example_json": example,
            }).execute()
            msg_id = msg_row.data[0]["id"]

        _persist_fields(db, msg_id, fields)

    # Replace errors
    db.table("api_error").delete().eq("api_id", api_id).execute()
    for err in result.get("errors", []):
        db.table("api_error").insert({
            "api_id": api_id,
            "http_status": err.get("http_status"),
            "result_status": err.get("result_status"),
            "result_code": str(err["result_code"]) if err.get("result_code") is not None else None,
            "result_message": err.get("result_message"),
            "condition": err.get("condition"),
            "confidence_score": err.get("confidence_score", 1.0),
        }).execute()

    # Replace edge cases
    db.table("edge_case").delete().eq("api_id", api_id).execute()
    for ec in result.get("edge_cases", []):
        _persist_edge_case(db, api_id, ec)

    # Update description/method/path/confidence if AI returned them
    patch = {}
    if result.get("description"):
        patch["description"] = result["description"]
    if result.get("method"):
        patch["method"] = result["method"]
    if result.get("path"):
        patch["path"] = result["path"]
    patch["confidence_score"] = 1.0
    db.table("api").update(patch).eq("id", api_id).execute()

    # Return full updated API
    updated = (
        db.table("api")
        .select("*, security_profile(*), api_message(*, api_field(*, api_field_enum(*)))")
        .eq("id", api_id)
        .single()
        .execute()
    )
    return updated.data
