"""
Full parsing pipeline orchestrator.
Ingestion → Classification → LLM Extraction → DB persistence.
"""
import os
import uuid
from app.services.parser.ingestion import ingest_file, save_upload
from app.services.parser.sheet_classifier import split_sections, SheetKind
from app.services.parser.llm_extractor import (
    extract_apis,
    extract_flow,
    extract_edge_cases,
    extract_document_metadata,
)
from app.core.database import get_db
from app.models.canonical import Owner


async def process_document(
    file_bytes: bytes,
    filename: str,
    owner: str,  # "Monee" | "Bank"
) -> dict:
    """
    Full pipeline: file → DB.
    Returns the created api_document record + summary stats.
    """
    db = get_db()

    # ── 1. Save file ─────────────────────────────────────────
    safe_name = f"{uuid.uuid4()}_{filename}"
    file_path = save_upload(file_bytes, safe_name)
    ext = os.path.splitext(filename)[1].lower().lstrip(".")

    # ── 2. Convert to Markdown ────────────────────────────────
    markdown = ingest_file(file_path)

    # ── 3. Extract document metadata ─────────────────────────
    meta = extract_document_metadata(markdown, filename)

    # ── 4. Persist api_document ───────────────────────────────
    doc_row = (
        db.table("api_document")
        .insert({
            "name": meta.get("name") or filename,
            "owner": owner,
            "partner_name": meta.get("partner_name"),
            "flow_name": meta.get("flow_name"),
            "version": meta.get("version"),
            "doc_date": meta.get("doc_date"),
            "raw_format": ext if ext in ("docx", "xlsx", "pdf", "md") else "docx",
            "raw_storage_path": file_path,
            "markdown_content": markdown,
        })
        .execute()
    )
    document_id = doc_row.data[0]["id"]

    # ── 5. Classify sections ──────────────────────────────────
    sections = split_sections(markdown)

    stats = {"document_id": document_id, "apis": 0, "flows": 0, "edge_cases": 0, "errors_skipped": []}

    api_name_to_id: dict[str, str] = {}

    # ── 6. Extract APIs from api_spec sections ────────────────
    for section in sections:
        if section.kind == SheetKind.api_spec:
            result = extract_apis(section.content)
            for api_data in result.get("apis", []):
                api_id = _persist_api(db, document_id, api_data, api_name_to_id)
                if api_id:
                    stats["apis"] += 1

    # ── 7. Extract flows from overview/metadata sections ──────
    for section in sections:
        if section.kind in (SheetKind.metadata, SheetKind.unknown):
            result = extract_flow(section.content)
            flow = result.get("flow")
            if flow and flow.get("steps"):
                _persist_flow(db, document_id, flow, api_name_to_id)
                stats["flows"] += 1

    # ── 8. Extract edge cases ─────────────────────────────────
    for section in sections:
        if section.kind in (SheetKind.edge_case, SheetKind.api_spec):
            result = extract_edge_cases(section.content)
            for ec in result.get("edge_cases", []):
                api_id = api_name_to_id.get(ec.get("api_name", ""))
                if api_id:
                    _persist_edge_case(db, api_id, ec, api_name_to_id)
                    stats["edge_cases"] += 1

    return stats


# ─── DB persistence helpers ───────────────────────────────────

def _persist_api(db, document_id: str, api_data: dict, name_map: dict) -> str | None:
    try:
        # Security profile
        sec = api_data.get("security_profile") or {}
        sec_id = None
        if any(sec.values()):
            sec_row = (
                db.table("security_profile")
                .insert({
                    "auth_type": sec.get("auth_type"),
                    "algorithm": sec.get("algorithm"),
                    "signed_fields": sec.get("signed_fields") or [],
                    "sig_location": sec.get("signature_location"),
                    "token_source_api": sec.get("token_source_api"),
                })
                .execute()
            )
            sec_id = sec_row.data[0]["id"]

        api_row = (
            db.table("api")
            .insert({
                "document_id": document_id,
                "name": api_data.get("name", "Unnamed API"),
                "description": api_data.get("description"),
                "method": api_data.get("method"),
                "path": api_data.get("path"),
                "exposed_by": api_data.get("exposed_by", "Monee"),
                "is_idempotent": api_data.get("is_idempotent", False),
                "security_profile_id": sec_id,
                "confidence_score": api_data.get("confidence_score", 1.0),
            })
            .execute()
        )
        api_id = api_row.data[0]["id"]
        name_map[api_data.get("name", "")] = api_id

        # Request message + fields
        req = api_data.get("request", {})
        if req:
            msg_row = (
                db.table("api_message")
                .insert({
                    "api_id": api_id,
                    "message_type": "request",
                    "example_json": req.get("example_json"),
                })
                .execute()
            )
            msg_id = msg_row.data[0]["id"]
            _persist_fields(db, msg_id, req.get("fields", []), parent_id=None)

        # Response message + fields
        resp = api_data.get("response", {})
        if resp:
            msg_row = (
                db.table("api_message")
                .insert({
                    "api_id": api_id,
                    "message_type": "response",
                    "example_json": resp.get("example_json"),
                })
                .execute()
            )
            msg_id = msg_row.data[0]["id"]
            _persist_fields(db, msg_id, resp.get("fields", []), parent_id=None)

        # Errors
        for err in api_data.get("errors", []):
            db.table("api_error").insert({
                "api_id": api_id,
                "http_status": err.get("http_status"),
                "result_status": err.get("result_status"),
                "result_code": str(err.get("result_code")) if err.get("result_code") is not None else None,
                "result_message": err.get("result_message"),
                "condition": err.get("condition"),
                "confidence_score": err.get("confidence_score", 1.0),
            }).execute()

        return api_id
    except Exception as e:
        return None


def _persist_fields(db, message_id: str, fields: list, parent_id: str | None):
    for f in fields:
        field_row = (
            db.table("api_field")
            .insert({
                "message_id": message_id,
                "parent_field_id": parent_id,
                "name": f.get("name", ""),
                "description": f.get("description"),
                "data_type": f.get("data_type"),
                "max_length": f.get("max_length"),
                "is_required": f.get("is_required", False),
                "default_value": f.get("default_value"),
                "constraints": f.get("constraints"),
                "is_encrypted": f.get("is_encrypted", False),
                "is_deprecated": f.get("is_deprecated", False),
                "confidence_score": f.get("confidence_score", 1.0),
            })
            .execute()
        )
        field_id = field_row.data[0]["id"]

        # Enums
        for val in f.get("enums", []):
            db.table("api_field_enum").insert({
                "field_id": field_id,
                "value": str(val),
            }).execute()

        # Recurse children
        if f.get("children"):
            _persist_fields(db, message_id, f["children"], parent_id=field_id)


def _persist_flow(db, document_id: str, flow: dict, api_name_map: dict):
    flow_row = (
        db.table("flow")
        .insert({
            "document_id": document_id,
            "name": flow.get("name", "Main Flow"),
            "description": flow.get("description"),
        })
        .execute()
    )
    flow_id = flow_row.data[0]["id"]

    for step in flow.get("steps", []):
        api_id = api_name_map.get(step.get("api_name", ""))
        db.table("flow_step").insert({
            "flow_id": flow_id,
            "step_order": step.get("order", 0),
            "label": step.get("label", ""),
            "actor_from": step.get("actor_from"),
            "actor_to": step.get("actor_to"),
            "api_id": api_id,
        }).execute()


def _persist_edge_case(db, api_id: str, ec: dict, api_name_map: dict):
    next_api_id = api_name_map.get(ec.get("next_api_name", ""))
    action = ec.get("action", "fail")
    valid_actions = {"retry", "inquiry", "next_step", "fail", "end_flow"}
    if action not in valid_actions:
        action = "fail"
    db.table("edge_case").insert({
        "api_id": api_id,
        "condition": ec.get("condition"),
        "action": action,
        "retry_max": ec.get("retry_max"),
        "retry_interval_sec": ec.get("retry_interval_sec"),
        "next_api_id": next_api_id,
        "notes": ec.get("notes"),
    }).execute()
