"""
LLM extraction using Google Gemini.
Provides three modes:
  - extract_all(markdown): text-based extraction from pre-converted markdown
  - extract_all_from_file(gemini_file_uri, selected_sheets): native Gemini File API extraction
    that preserves images, charts, and visual content from office files
  - extract_document_metadata(markdown, filename): lightweight metadata-only pass
"""
import ast
import json
import re
import logging
import traceback
import textwrap
import google.generativeai as genai
from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client_initialized = False


def _parse_llm_json(raw: str) -> dict:
    """
    Parse LLM JSON output with fallbacks for common Gemini quirks:
      - Strips markdown code fences
      - Fixes Python literals (None/True/False → null/true/false)
      - Falls back to ast.literal_eval for single-quoted keys/values
    Raises json.JSONDecodeError if all attempts fail.
    """
    raw = raw.strip()

    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    if raw.startswith("```"):
        lines = raw.splitlines()
        end = -1 if lines[-1].strip() == "```" else len(lines)
        raw = "\n".join(lines[1:end]).strip()

    # Attempt 1: strict JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Attempt 2: fix Python literals then retry
    fixed = re.sub(r'\bNone\b', 'null', raw)
    fixed = re.sub(r'\bTrue\b', 'true', fixed)
    fixed = re.sub(r'\bFalse\b', 'false', fixed)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Attempt 3: ast.literal_eval handles single-quoted keys/values
    try:
        result = ast.literal_eval(raw)
        if isinstance(result, (dict, list)):
            # Round-trip through json to normalise types
            return json.loads(json.dumps(result))
    except Exception:
        pass

    # Re-raise with original raw for diagnostics
    return json.loads(raw)


def _init_client():
    global _client_initialized
    if not _client_initialized:
        s = get_settings()
        genai.configure(api_key=s.gemini_api_key)
        _client_initialized = True


# ─── System prompt ─────────────────────────────────────────────

_SYSTEM_PROMPT = textwrap.dedent("""
You are an expert API documentation analyst specializing in fintech integrations.
Your job is to extract structured data from API documentation (which may be in English, Vietnamese, or mixed).
Always output ONLY valid JSON. Normalize all descriptions to English.
Be precise. If a value is unclear, use null. Set confidence_score between 0.0 and 1.0.
""").strip()


# ─── Combined extraction prompt ────────────────────────────────

_EXTRACT_ALL_PROMPT = textwrap.dedent("""
Extract all integration flows and their APIs from the following API documentation.

Return a JSON object with this exact structure:

{
  "flows": [
    {
      "name": "string (e.g. OTP Verification Flow)",
      "description": "string (English, 1-2 sentences)",
      "steps": [
        {
          "order": 1,
          "label": "string (English, concise action label)",
          "actor_from": "string (e.g. Monee, Bank, Customer, System)",
          "actor_to": "string",
          "api_name": "string|null  (must match an api name in this flow's apis array)"
        }
      ],
      "apis": [
        {
          "name": "string",
          "description": "string (English)",
          "method": "GET|POST|PUT|PATCH|DELETE|null",
          "path": "string|null",
          "exposed_by": "Monee|Bank",
          "is_idempotent": false,
          "confidence_score": 0.95,
          "security_profile": {
            "auth_type": "Bearer|null",
            "algorithm": "SHA256withRSA|null",
            "signed_fields": [],
            "signature_location": "header|body|null",
            "token_source_api": "string|null"
          },
          "request": {
            "example_json": "string|null",
            "fields": [
              {
                "name": "string",
                "description": "string (English)",
                "data_type": "String|Number|Object|Array|Boolean|Date|null",
                "max_length": null,
                "is_required": true,
                "default_value": "string|null",
                "constraints": "string|null",
                "value_logic": "string|null",
                "is_encrypted": false,
                "is_deprecated": false,
                "confidence_score": 0.95,
                "enums": [],
                "children": []
              }
            ]
          },
          "response": {
            "example_json": "string|null",
            "fields": []
          },
          "errors": [
            {
              "http_status": 200,
              "result_status": "string|null",
              "result_code": "string|null",
              "result_message": "string|null",
              "condition": "string|null",
              "confidence_score": 0.9
            }
          ],
          "edge_cases": [
            {
              "condition": "string|null",
              "action": "retry|inquiry|next_step|fail|end_flow",
              "retry_max": null,
              "retry_interval_sec": null,
              "next_api_name": "string|null",
              "notes": "string|null"
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Group APIs under the flow they belong to. If the document describes multiple flows, output multiple flow objects.
- If there is no explicit flow structure, create one flow named after the document's main purpose.
- exposed_by: "Bank" if the API is exposed/provided by the bank/partner, otherwise "Monee"
- is_encrypted: true if the field is marked as sensitive/encrypted
- is_deprecated: true if field has strikethrough (~~text~~) or is explicitly deprecated
- value_logic: extract any sample value (e.g. "VCB001"), fixed/constant value (e.g. "Fixed: PAYMENT"), or conditional logic (e.g. "If type=A then X; if type=B then Y") shown for the field; use null if none present
- For nested objects, put child fields in the "children" array of the parent field
- Extract ALL result code rows from inline tables (resultStatus + resultCode + resultMessage)
- signed_fields: ordered list of field names used to build the signature string
- api_name in steps must exactly match the name field of an api in the same flow's apis array
- If an API appears in multiple flows, duplicate it in each flow

Documentation:
---
{content}
---
""").strip()


# ─── File-based extraction prompt (Gemini File API) ───────────
# Used when the raw file is passed directly instead of markdown text.

_EXTRACT_ALL_PROMPT_FILE = textwrap.dedent("""
Extract all integration flows and their APIs from the attached API documentation.
{sheet_hint}
Return a JSON object with this exact structure:

{{
  "flows": [
    {{
      "name": "string (e.g. OTP Verification Flow)",
      "description": "string (English, 1-2 sentences)",
      "steps": [
        {{
          "order": 1,
          "label": "string (English, concise action label)",
          "actor_from": "string (e.g. Monee, Bank, Customer, System)",
          "actor_to": "string",
          "api_name": "string|null  (must match an api name in this flow's apis array)"
        }}
      ],
      "apis": [
        {{
          "name": "string",
          "description": "string (English)",
          "method": "GET|POST|PUT|PATCH|DELETE|null",
          "path": "string|null",
          "exposed_by": "Monee|Bank",
          "is_idempotent": false,
          "confidence_score": 0.95,
          "security_profile": {{
            "auth_type": "Bearer|null",
            "algorithm": "SHA256withRSA|null",
            "signed_fields": [],
            "signature_location": "header|body|null",
            "token_source_api": "string|null"
          }},
          "request": {{
            "example_json": "string|null",
            "fields": [
              {{
                "name": "string",
                "description": "string (English)",
                "data_type": "String|Number|Object|Array|Boolean|Date|null",
                "max_length": null,
                "is_required": true,
                "default_value": "string|null",
                "constraints": "string|null",
                "value_logic": "string|null",
                "is_encrypted": false,
                "is_deprecated": false,
                "confidence_score": 0.95,
                "enums": [],
                "children": []
              }}
            ]
          }},
          "response": {{
            "example_json": "string|null",
            "fields": []
          }},
          "errors": [
            {{
              "http_status": 200,
              "result_status": "string|null",
              "result_code": "string|null",
              "result_message": "string|null",
              "condition": "string|null",
              "confidence_score": 0.9
            }}
          ],
          "edge_cases": [
            {{
              "condition": "string|null",
              "action": "retry|inquiry|next_step|fail|end_flow",
              "retry_max": null,
              "retry_interval_sec": null,
              "next_api_name": "string|null",
              "notes": "string|null"
            }}
          ]
        }}
      ]
    }}
  ]
}}

Rules:
- Group APIs under the flow they belong to. If the document describes multiple flows, output multiple flow objects.
- If there is no explicit flow structure, create one flow named after the document's main purpose.
- exposed_by: "Bank" if the API is exposed/provided by the bank/partner, otherwise "Monee"
- is_encrypted: true if the field is marked as sensitive/encrypted
- is_deprecated: true if field has strikethrough (~~text~~) or is explicitly deprecated
- value_logic: extract any sample value (e.g. "VCB001"), fixed/constant value (e.g. "Fixed: PAYMENT"), or conditional logic (e.g. "If type=A then X; if type=B then Y") shown for the field; use null if none present
- For nested objects, put child fields in the "children" array of the parent field
- Extract ALL result code rows from inline tables (resultStatus + resultCode + resultMessage)
- signed_fields: ordered list of field names used to build the signature string
- api_name in steps must exactly match the name field of an api in the same flow's apis array
- If an API appears in multiple flows, duplicate it in each flow
- Pay careful attention to any diagrams, images, or sequence charts in the document — extract flow steps from them
""").strip()


# ─── Core LLM call ────────────────────────────────────────────

def _call_llm(prompt: str) -> dict:
    _init_client()
    s = get_settings()
    model = genai.GenerativeModel(
        model_name=s.gemini_model,
        system_instruction=_SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    response = model.generate_content(prompt)
    return _parse_llm_json(response.text)


# ─── Public extraction functions ──────────────────────────────

def extract_all(markdown: str) -> dict:
    """
    Combined single-pass extraction: returns flows with APIs nested inside.
    Output shape: { "flows": [ { name, description, steps, apis } ] }
    On failure returns { "flows": [], "_error": "..." }
    """
    prompt = _EXTRACT_ALL_PROMPT.replace("{content}", markdown)
    try:
        result = _call_llm(prompt)
        if "flows" not in result:
            result = {"flows": [], "_error": "LLM did not return a flows key"}
        return result
    except Exception as e:
        return {"flows": [], "_error": str(e)}


def extract_all_from_file(
    gemini_file_uri: str,
    selected_sheets: list[str] | None = None,
    sheet_kinds: dict[str, str] | None = None,
    flow_sequence: dict[str, list[dict]] | None = None,
) -> dict:
    """
    Extract using Gemini File API — the raw file is passed directly so Gemini
    can read embedded images, charts, and diagrams that markitdown would drop.

    selected_sheets: if provided, Gemini is instructed to focus only on those sheets.
    Output shape: { "flows": [ { name, description, steps, apis } ] }
    On failure returns { "flows": [], "_error": "..." }
    """
    _init_client()
    s = get_settings()

    sheet_hint = ""
    if selected_sheets:
        kind_descriptions = {
            "api_spec":   "contains API endpoint definitions (URL, request/response fields)",
            "error_code": "reference table of result/error codes",
            "edge_case":  "runtime handling logic (retry, inquiry, timeouts)",
            "mapping":    "code mapping or lookup table — extract only if referenced by an API",
            "flow":       "flow diagram or sequence overview — use to understand the overall process",
            "metadata":   "changelog, environment info, overview — informational only",
        }
        lines = ["Sheet context for this document:"]
        for name in selected_sheets:
            kind = (sheet_kinds or {}).get(name, "api_spec")
            desc = kind_descriptions.get(kind, "")
            lines.append(f'  - "{name}": {kind.replace("_", " ").title()} — {desc}')
        lines.append("\nFocus ONLY on the sheets listed above. Ignore all other sheets.")
        sheet_hint = "\n" + "\n".join(lines) + "\n"

    # Append user-defined flow step sequences as structured hints
    if flow_sequence:
        seq_lines = [
            "\nFlow sequence hints (user-defined — follow these step orders when building flow_step arrays):"
        ]
        for flow_name, steps in flow_sequence.items():
            seq_lines.append(f'  Flow "{flow_name}":')
            for i, step in enumerate(steps, 1):
                seq_lines.append(f'    Step {i}: "{step["sheet_name"]}" sheet — {step.get("label", step["sheet_name"])}')
        sheet_hint += "\n".join(seq_lines) + "\n"

    prompt = _EXTRACT_ALL_PROMPT_FILE.format(sheet_hint=sheet_hint)

    try:
        logger.info("extract_all_from_file: fetching Gemini file uri=%s", gemini_file_uri)
        # genai.get_file expects just the file name (e.g. "files/xxx" or "xxx"),
        # not the full URI. Extract the name portion if a full URL was stored.
        file_name = gemini_file_uri
        if "generativelanguage.googleapis.com" in gemini_file_uri:
            # Extract path after the domain, e.g. "/v1beta/files/5gnr3pdfkz0a" -> "files/5gnr3pdfkz0a"
            from urllib.parse import urlparse
            parsed = urlparse(gemini_file_uri)
            # path is like /v1beta/files/<id>
            parts = parsed.path.lstrip("/").split("/")
            # find "files" segment
            try:
                idx = parts.index("files")
                file_name = "/".join(parts[idx:])
            except ValueError:
                file_name = parts[-1]
        uploaded_file = genai.get_file(file_name)
        logger.info("Gemini file state=%s size=%s", getattr(uploaded_file, "state", "?"), getattr(uploaded_file, "size_bytes", "?"))
        model = genai.GenerativeModel(
            model_name=s.gemini_model,
            system_instruction=_SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        logger.info("Sending generate_content to Gemini model=%s", s.gemini_model)
        response = model.generate_content([uploaded_file, prompt])
        raw = response.text
        logger.info("Gemini response received, raw length=%d chars", len(raw))
        result = _parse_llm_json(raw)
        if isinstance(result, list):
            result = {"flows": result}
        if "flows" not in result:
            logger.warning("Gemini returned JSON without 'flows' key: %s", list(result.keys()))
            result = {"flows": [], "_error": "LLM did not return a flows key"}
        else:
            logger.info("Extraction complete: %d flow(s) returned", len(result["flows"]))
        return result
    except Exception as e:
        logger.error("extract_all_from_file failed uri=%s\n%s", gemini_file_uri, traceback.format_exc())
        return {"flows": [], "_error": str(e)}


def extract_all_from_xlsx(
    file_path: str,
    selected_sheets: list[str] | None = None,
    sheet_kinds: dict[str, str] | None = None,
    flow_sequence: dict[str, list[dict]] | None = None,
) -> dict:
    """
    Extract from an XLSX file by:
      1. Converting selected sheets to markdown tables (text)
      2. Extracting embedded images from those sheets and uploading to Gemini
      3. Calling generate_content with [*images, text, prompt+hints]

    This preserves embedded diagrams/charts while Gemini File API's XLSX MIME
    type is unsupported.
    """
    import openpyxl
    import io

    _init_client()
    s = get_settings()

    # ── Build sheet/flow hints (same logic as extract_all_from_file) ──
    sheet_hint = ""
    if selected_sheets:
        kind_descriptions = {
            "api_spec":   "contains API endpoint definitions (URL, request/response fields)",
            "error_code": "reference table of result/error codes",
            "edge_case":  "runtime handling logic (retry, inquiry, timeouts)",
            "mapping":    "code mapping or lookup table — extract only if referenced by an API",
            "flow":       "flow diagram or sequence overview — use to understand the overall process",
            "metadata":   "changelog, environment info, overview — informational only",
        }
        lines = ["Sheet context for this document:"]
        for name in selected_sheets:
            kind = (sheet_kinds or {}).get(name, "api_spec")
            desc = kind_descriptions.get(kind, "")
            lines.append(f'  - "{name}": {kind.replace("_", " ").title()} — {desc}')
        lines.append("\nFocus ONLY on the sheets listed above. Ignore all other sheets.")
        sheet_hint = "\n" + "\n".join(lines) + "\n"

    if flow_sequence:
        seq_lines = [
            "\nFlow sequence hints (user-defined — follow these step orders when building flow_step arrays):"
        ]
        for flow_name, steps in flow_sequence.items():
            seq_lines.append(f'  Flow "{flow_name}":')
            for i, step in enumerate(steps, 1):
                seq_lines.append(f'    Step {i}: "{step["sheet_name"]}" sheet — {step.get("label", step["sheet_name"])}')
        sheet_hint += "\n".join(seq_lines) + "\n"

    prompt = _EXTRACT_ALL_PROMPT_FILE.format(sheet_hint=sheet_hint)

    try:
        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheet_names = selected_sheets if selected_sheets else wb.sheetnames

        # ── Convert selected sheets to markdown tables ──
        text_parts = []
        for name in sheet_names:
            if name not in wb.sheetnames:
                continue
            ws = wb[name]
            text_parts.append(f"\n## Sheet: {name}\n")
            rows = []
            for row in ws.iter_rows(values_only=True):
                if not any(cell is not None for cell in row):
                    continue
                rows.append([str(c) if c is not None else "" for c in row])
            if not rows:
                text_parts.append("(empty)\n")
                continue
            col_count = max(len(r) for r in rows)
            header = rows[0] + [""] * (col_count - len(rows[0]))
            text_parts.append("| " + " | ".join(header) + " |")
            text_parts.append("| " + " | ".join(["---"] * col_count) + " |")
            for row in rows[1:]:
                padded = row + [""] * (col_count - len(row))
                text_parts.append("| " + " | ".join(padded) + " |")
            text_parts.append("")

        sheet_text = "\n".join(text_parts)

        # ── Extract embedded images from selected sheets ──
        uploaded_images = []
        for name in sheet_names:
            if name not in wb.sheetnames:
                continue
            ws = wb[name]
            for img in getattr(ws, "_images", []):
                try:
                    img_bytes = img._data()
                    # Detect mime type from magic bytes
                    if img_bytes[:4] == b'\x89PNG':
                        mime = "image/png"
                        ext = "png"
                    elif img_bytes[:2] == b'\xff\xd8':
                        mime = "image/jpeg"
                        ext = "jpg"
                    else:
                        mime = "image/png"
                        ext = "png"
                    gfile = genai.upload_file(
                        path=io.BytesIO(img_bytes),
                        mime_type=mime,
                        display_name=f"{name}_image.{ext}",
                    )
                    uploaded_images.append(gfile)
                    logger.info("Uploaded embedded image from sheet=%s mime=%s", name, mime)
                except Exception:
                    logger.warning("Failed to upload image from sheet=%s", name, exc_info=True)

        wb.close()

        logger.info(
            "extract_all_from_xlsx: %d sheet(s), %d embedded image(s)",
            len(sheet_names), len(uploaded_images),
        )

        model = genai.GenerativeModel(
            model_name=s.gemini_model,
            system_instruction=_SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )

        # Build content: images first, then sheet text, then prompt
        content = [*uploaded_images, sheet_text, prompt]
        response = model.generate_content(content)
        raw = response.text
        logger.info("Gemini response received, raw length=%d chars", len(raw))
        result = _parse_llm_json(raw)
        if isinstance(result, list):
            result = {"flows": result}
        if "flows" not in result:
            logger.warning("Gemini returned JSON without 'flows' key: %s", list(result.keys()))
            result = {"flows": [], "_error": "LLM did not return a flows key"}
        else:
            logger.info("Extraction complete: %d flow(s) returned", len(result["flows"]))
        # Attach generated sheet markdown so callers can store it for review/editing
        result["_sheet_markdown"] = sheet_text
        return result
    except Exception as e:
        logger.error("extract_all_from_xlsx failed path=%s\n%s", file_path, traceback.format_exc())
        return {"flows": [], "_error": str(e)}


def extract_document_metadata(full_markdown: str, filename: str) -> dict:
    """Extract high-level document metadata from the full markdown."""
    _init_client()
    s = get_settings()
    prompt = textwrap.dedent(f"""
    Extract document metadata from the following API documentation.
    Return JSON:
    {{
      "name": "string",
      "partner_name": "string|null",
      "flow_name": "string|null",
      "version": "string|null",
      "doc_date": "string|null"
    }}

    Filename hint: {filename}

    First 3000 characters of document:
    ---
    {full_markdown[:3000]}
    ---
    """).strip()

    try:
        model = genai.GenerativeModel(
            model_name=s.gemini_model,
            system_instruction=_SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        response = model.generate_content(prompt)
        return _parse_llm_json(response.text)
    except Exception:
        return {
            "name": filename,
            "partner_name": None,
            "flow_name": None,
            "version": None,
            "doc_date": None,
        }


# ─── Single-API re-extraction ───────────────────────────────────

_REEXTRACT_API_PROMPT = textwrap.dedent("""
You are re-extracting the specification for a single API from the provided content (screenshots and/or markdown text).

Target API context:
  Name: {api_name}
  Method: {method}
  Path: {path}
  Exposed by: {exposed_by}

Extract ONLY this API. Return a JSON object with this exact structure:

{{
  "description": "string (English, 1-2 sentences)|null",
  "method": "GET|POST|PUT|PATCH|DELETE|null",
  "path": "string|null",
  "request": {{
    "example_json": "string|null",
    "fields": [
      {{
        "name": "string",
        "description": "string (English)|null",
        "data_type": "String|Number|Object|Array|Boolean|Date|null",
        "max_length": null,
        "is_required": true,
        "default_value": "string|null",
        "constraints": "string|null",
        "value_logic": "string|null",
        "is_encrypted": false,
        "is_deprecated": false,
        "confidence_score": 0.95,
        "enums": [],
        "children": []
      }}
    ]
  }},
  "response": {{
    "example_json": "string|null",
    "fields": []
  }},
  "errors": [
    {{
      "http_status": 200,
      "result_status": "string|null",
      "result_code": "string|null",
      "result_message": "string|null",
      "condition": "string|null",
      "confidence_score": 0.9
    }}
  ],
  "edge_cases": [
    {{
      "condition": "string|null",
      "action": "retry|inquiry|next_step|fail|end_flow",
      "retry_max": null,
      "retry_interval_sec": null,
      "notes": "string|null"
    }}
  ]
}}

Rules:
- Focus only on the target API above. Ignore unrelated APIs.
- is_encrypted: true if field is marked sensitive/encrypted
- is_deprecated: true if field has strikethrough or is marked deprecated
- value_logic: extract any sample value (e.g. "VCB001"), fixed/constant value (e.g. "Fixed: PAYMENT"), or conditional logic (e.g. "If type=A then X; if type=B then Y") shown for the field; use null if none present
- For nested objects, put child fields in the "children" array of the parent field
- Extract ALL result code rows from tables (resultStatus + resultCode + resultMessage)
- Normalize all descriptions to English
""").strip()


def reextract_api(
    api_name: str,
    method: str | None,
    path: str | None,
    exposed_by: str,
    files: list[tuple[bytes, str]],  # (content_bytes, mime_type)
) -> dict:
    """
    Re-extract a single API's spec from uploaded screenshots and/or markdown text.

    files: list of (bytes, mime_type). Images are uploaded to Gemini File API;
           text/markdown is passed inline as text content.

    Returns: { description, method, path, request, response, errors, edge_cases }
    On failure: { "_error": "..." }
    """
    import io

    _init_client()
    s = get_settings()

    prompt = _REEXTRACT_API_PROMPT.format(
        api_name=api_name,
        method=method or "unknown",
        path=path or "unknown",
        exposed_by=exposed_by,
    )

    content_parts = []
    text_parts = []

    for file_bytes, mime_type in files:
        if mime_type.startswith("image/"):
            try:
                gfile = genai.upload_file(
                    path=io.BytesIO(file_bytes),
                    mime_type=mime_type,
                    display_name=f"reextract_{api_name}.{mime_type.split('/')[-1]}",
                )
                content_parts.append(gfile)
                logger.info("reextract_api: uploaded image mime=%s", mime_type)
            except Exception:
                logger.warning("reextract_api: failed to upload image", exc_info=True)
        elif mime_type in ("text/plain", "text/markdown"):
            text_parts.append(file_bytes.decode("utf-8", errors="replace"))
        else:
            # Try to decode as text for unknown types
            try:
                text_parts.append(file_bytes.decode("utf-8", errors="replace"))
            except Exception:
                pass

    if text_parts:
        content_parts.append("\n\n---\n\n".join(text_parts))

    content_parts.append(prompt)

    try:
        model = genai.GenerativeModel(
            model_name=s.gemini_model,
            system_instruction=_SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        logger.info("reextract_api: sending to Gemini api=%s files=%d", api_name, len(files))
        response = model.generate_content(content_parts)
        result = _parse_llm_json(response.text)
        logger.info("reextract_api: success api=%s", api_name)
        return result
    except Exception as e:
        logger.error("reextract_api failed api=%s\n%s", api_name, traceback.format_exc())
        return {"_error": str(e)}
