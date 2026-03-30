"""
Parsing pipeline — split into phases:

  Phase 1a — ingest_to_markdown(file_bytes, filename, owner, parser)
      Non-XLSX: converts file to markdown via markitdown, saves api_document.
      XLSX: saves file, lists sheets, creates api_document with
            pipeline_status = "pending_sheet_selection".
      Returns { document_id, markdown? } or { document_id, sheets, is_xlsx: True }

  Phase 1b — confirm_sheet_selection(document_id, selected_sheets)
      XLSX only. Uploads the saved file to Gemini File API,
      stores gemini_file_uri + selected_sheets, sets pipeline_status = "file_ready".
      Returns { status: "ok" }

  Phase 2 — extract_and_draft(document_id)
      Reads from DB. If gemini_file_uri exists: uses Gemini File API extraction
      (preserves images). Otherwise falls back to markdown-based extraction.
      Stores result in extraction_draft.
      Returns the draft dict { flows: [...] }

  Phase 3 — persist_extraction(document_id)
      Reads extraction_draft from DB, persists flows + apis to tables.
      Returns stats { flows, apis, edge_cases }
"""
import logging
import os
import uuid
from app.services.parser.ingestion import ingest_file, save_upload, list_xlsx_sheets, upload_to_gemini
from app.services.parser.llm_extractor import extract_all, extract_all_from_file, extract_all_from_xlsx, extract_document_metadata
from app.core.database import get_db

logger = logging.getLogger(__name__)


# ─── Phase 1 ──────────────────────────────────────────────────

async def ingest_to_markdown(
    file_bytes: bytes,
    filename: str,
    owner: str,
    parser: str = "markitdown",
) -> dict:
    """
    Convert file → markdown (non-XLSX) or list sheets (XLSX).

    XLSX returns:
      { document_id, sheets: [...], is_xlsx: True }
    Non-XLSX returns:
      { document_id, markdown: "..." }
    """
    db = get_db()

    safe_name = f"{uuid.uuid4()}_{filename}"
    file_path = save_upload(file_bytes, safe_name)
    ext = os.path.splitext(filename)[1].lower().lstrip(".")

    if ext == "xlsx":
        # XLSX path: list sheets for user selection, defer Gemini upload
        sheets = list_xlsx_sheets(file_path)
        meta = {"name": filename, "partner_name": None, "flow_name": None, "version": None, "doc_date": None}

        doc_row = (
            db.table("api_document")
            .insert({
                "name": meta["name"],
                "owner": owner,
                "partner_name": meta["partner_name"],
                "flow_name": meta["flow_name"],
                "version": meta["version"],
                "doc_date": meta["doc_date"],
                "raw_format": "xlsx",
                "raw_storage_path": file_path,
                "markdown_content": None,
                "pipeline_status": "pending_sheet_selection",
                "parser": "gemini",
            })
            .execute()
        )
        document_id = doc_row.data[0]["id"]
        return {"document_id": document_id, "sheets": sheets, "is_xlsx": True}

    else:
        # Non-XLSX path: convert to markdown via markitdown
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
                "raw_format": ext if ext in ("docx", "pdf", "md") else "docx",
                "raw_storage_path": file_path,
                "markdown_content": markdown,
                "pipeline_status": "markdown_ready",
                "parser": parser,
            })
            .execute()
        )
        document_id = doc_row.data[0]["id"]
        return {"document_id": document_id, "markdown": markdown}


# ─── Phase 1b ─────────────────────────────────────────────────

def confirm_sheet_selection(
    document_id: str,
    selected_sheets: list[str],
    sheet_kinds: dict[str, str] | None = None,
    flow_sequence: dict[str, list[dict]] | None = None,
) -> dict:
    """
    Save sheet selection metadata and set pipeline_status = "file_ready".
    XLSX extraction uses the local file directly (extract_all_from_xlsx),
    so no Gemini File API upload is needed here.
    """
    db = get_db()

    doc_row = (
        db.table("api_document")
        .select("id")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not doc_row.data:
        raise ValueError(f"Document {document_id} not found")

    logger.info("confirm_sheet_selection doc=%s sheets=%s", document_id, selected_sheets)

    db.table("api_document").update({
        "selected_sheets": selected_sheets,
        "sheet_kinds": sheet_kinds or {},
        "flow_sequence": flow_sequence or {},
        "pipeline_status": "file_ready",
    }).eq("id", document_id).execute()

    return {"status": "ok"}


# ─── Phase 2 ──────────────────────────────────────────────────

def extract_and_draft(document_id: str) -> dict:
    """
    Run LLM extraction. Uses Gemini File API if gemini_file_uri is set,
    otherwise falls back to markdown-based extraction.
    Stores result in extraction_draft.
    Returns the draft { flows: [...] }.
    """
    db = get_db()

    doc_row = (
        db.table("api_document")
        .select("markdown_content, gemini_file_uri, selected_sheets, sheet_kinds, flow_sequence, raw_storage_path, raw_format")
        .eq("id", document_id)
        .single()
        .execute()
    )
    if not doc_row.data:
        raise ValueError(f"Document {document_id} not found")

    db.table("api_document").update({
        "pipeline_status": "extracting",
    }).eq("id", document_id).execute()

    gemini_uri = doc_row.data.get("gemini_file_uri")
    selected_sheets = doc_row.data.get("selected_sheets") or []
    sheet_kinds = doc_row.data.get("sheet_kinds") or {}
    flow_sequence = doc_row.data.get("flow_sequence") or {}

    raw_format = doc_row.data.get("raw_format", "")
    raw_storage_path = doc_row.data.get("raw_storage_path")

    if raw_format == "xlsx" and raw_storage_path:
        # Gemini doesn't support XLSX as a file input — convert sheets to text
        # and extract embedded images, passing both to Gemini with full hints.
        logger.info("extract_and_draft XLSX path doc=%s sheets=%s", document_id, selected_sheets)
        draft = extract_all_from_xlsx(
            raw_storage_path,
            selected_sheets or None,
            sheet_kinds or None,
            flow_sequence or None,
        )
        # Save the generated sheet markdown so "Edit Markdown" has content to show
        sheet_md = draft.pop("_sheet_markdown", None)
        if sheet_md:
            db.table("api_document").update({"markdown_content": sheet_md}).eq("id", document_id).execute()
    elif gemini_uri:
        logger.info("extract_and_draft using Gemini File API doc=%s uri=%s sheets=%s", document_id, gemini_uri, selected_sheets)
        draft = extract_all_from_file(
            gemini_uri,
            selected_sheets or None,
            sheet_kinds or None,
            flow_sequence or None,
        )
    else:
        logger.info("extract_and_draft using markdown doc=%s", document_id)
        markdown = doc_row.data.get("markdown_content") or ""
        draft = extract_all(markdown)

    if draft.get("_error"):
        logger.error("LLM extraction returned error doc=%s: %s", document_id, draft["_error"])

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
                "value_logic": f.get("value_logic"),
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
