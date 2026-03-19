"""
Parsing pipeline — split into three independent phases:

  Phase 1 — ingest_to_markdown(file_bytes, filename, owner, parser)
      Converts file to markdown, saves api_document record.
      Returns { document_id, markdown }

  Phase 2 — extract_and_draft(document_id)
      Reads markdown from DB, runs LLM, stores result in extraction_draft.
      Returns the draft dict { flows: [...] }

  Phase 3 — persist_extraction(document_id)
      Reads extraction_draft from DB, persists flows + apis to tables.
      Returns stats { flows, apis, edge_cases }
"""
import os
import uuid
from app.services.parser.ingestion import ingest_file, save_upload
from app.services.parser.llm_extractor import extract_all, extract_document_metadata
from app.core.database import get_db


# ─── Phase 1 ──────────────────────────────────────────────────

async def ingest_to_markdown(
    file_bytes: bytes,
    filename: str,
    owner: str,
    parser: str = "markitdown",
) -> dict:
    """
    Convert file → markdown and create api_document record.
    Returns { document_id, markdown }
    """
    db = get_db()

    safe_name = f"{uuid.uuid4()}_{filename}"
    file_path = save_upload(file_bytes, safe_name)
    ext = os.path.splitext(filename)[1].lower().lstrip(".")

    markdown = ingest_file(file_path)

    meta = extract_document_metadata(markdown, filename)

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
            "pipeline_status": "markdown_ready",
            "parser": parser,
        })
        .execute()
    )
    document_id = doc_row.data[0]["id"]
    return {"document_id": document_id, "markdown": markdown}


# ─── Phase 2 ──────────────────────────────────────────────────

def extract_and_draft(document_id: str) -> dict:
    """
    Read markdown from DB, run combined LLM extraction, store draft.
    Returns the extraction draft { flows: [...] } or raises on failure.
    """
    db = get_db()

    doc_row = (
        db.table("api_document")
        .select("markdown_content")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not doc_row.data:
        raise ValueError(f"Document {document_id} not found")

    markdown = doc_row.data.get("markdown_content") or ""

    db.table("api_document").update({
        "pipeline_status": "extracting",
    }).eq("id", document_id).execute()

    draft = extract_all(markdown)

    db.table("api_document").update({
        "pipeline_status": "extraction_review",
        "extraction_draft": draft,
    }).eq("id", document_id).execute()

    return draft


# ─── Phase 3 ──────────────────────────────────────────────────

def persist_extraction(document_id: str) -> dict:
    """
    Read extraction_draft from DB, persist flows + apis, mark complete.
    Returns stats { flows, apis, edge_cases }
    """
    db = get_db()

    doc_row = (
        db.table("api_document")
        .select("extraction_draft")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not doc_row.data or not doc_row.data.get("extraction_draft"):
        raise ValueError(f"No extraction draft found for document {document_id}")

    draft = doc_row.data["extraction_draft"]

    # Delete existing flows (cascades to apis, flow_steps)
    db.table("flow").delete().eq("document_id", document_id).execute()

    stats = {"flows": 0, "apis": 0, "edge_cases": 0}

    for flow_data in draft.get("flows", []):
        flow_id = _persist_flow(db, document_id, flow_data)
        stats["flows"] += 1

        # Create APIs first so we can link steps by api_name
        api_name_to_id: dict[str, str] = {}
        for api_data in flow_data.get("apis", []):
            api_id = _persist_api(db, flow_id, api_data)
            if api_id:
                stats["apis"] += 1
                api_name_to_id[api_data.get("name", "")] = api_id
                for ec in api_data.get("edge_cases", []):
                    _persist_edge_case(db, api_id, ec)
                    stats["edge_cases"] += 1

        # Now create steps with resolved api_ids
        _persist_flow_steps(db, flow_id, flow_data.get("steps", []), api_name_to_id)

    db.table("api_document").update({
        "pipeline_status": "complete",
        "extraction_draft": None,
    }).eq("id", document_id).execute()

    return stats


# ─── DB persistence helpers ───────────────────────────────────

def _persist_flow(db, document_id: str, flow_data: dict) -> str:
    flow_row = (
        db.table("flow")
        .insert({
            "document_id": document_id,
            "name": flow_data.get("name", "Main Flow"),
            "description": flow_data.get("description"),
        })
        .execute()
    )
    return flow_row.data[0]["id"]


def _persist_flow_steps(db, flow_id: str, steps: list, api_name_to_id: dict[str, str]):
    """Persist flow steps, linking api_id by api_name after APIs have been created."""
    for step in steps:
        api_id = api_name_to_id.get(step.get("api_name", ""))
        db.table("flow_step").insert({
            "flow_id": flow_id,
            "step_order": step.get("order", 0),
            "label": step.get("label", ""),
            "actor_from": step.get("actor_from"),
            "actor_to": step.get("actor_to"),
            "api_id": api_id,
        }).execute()


def _persist_api(db, flow_id: str, api_data: dict) -> str | None:
    try:
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
                "flow_id": flow_id,
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
            _persist_fields(db, msg_row.data[0]["id"], req.get("fields", []))

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
            _persist_fields(db, msg_row.data[0]["id"], resp.get("fields", []))

        for err in api_data.get("errors", []):
            db.table("api_error").insert({
                "api_id": api_id,
                "http_status": err.get("http_status"),
                "result_status": err.get("result_status"),
                "result_code": str(err["result_code"]) if err.get("result_code") is not None else None,
                "result_message": err.get("result_message"),
                "condition": err.get("condition"),
                "confidence_score": err.get("confidence_score", 1.0),
            }).execute()

        return api_id
    except Exception:
        return None


def _persist_fields(db, message_id: str, fields: list, parent_id: str | None = None):
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
        for val in f.get("enums", []):
            db.table("api_field_enum").insert({
                "field_id": field_id,
                "value": str(val),
            }).execute()
        if f.get("children"):
            _persist_fields(db, message_id, f["children"], parent_id=field_id)


def _persist_edge_case(db, api_id: str, ec: dict):
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
        "notes": ec.get("notes"),
    }).execute()
