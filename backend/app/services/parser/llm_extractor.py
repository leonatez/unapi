"""
Step 3: LLM extraction.
Given a classified Markdown section, extract structured API data.
Uses Google Gemini with JSON output mode.
"""
import json
import textwrap
import google.generativeai as genai
from app.core.config import get_settings

_client_initialized = False


def _init_client():
    global _client_initialized
    if not _client_initialized:
        s = get_settings()
        genai.configure(api_key=s.gemini_api_key)
        _client_initialized = True


# ─── Prompts ──────────────────────────────────────────────────

_SYSTEM_PROMPT = textwrap.dedent("""
You are an expert API documentation analyst specializing in fintech integrations.
Your job is to extract structured data from API documentation (which may be in English, Vietnamese, or mixed).
Always output ONLY valid JSON. Normalize all descriptions to English.
Be precise. If a value is unclear, use null. Set confidence_score between 0.0 and 1.0.
""").strip()

_API_EXTRACTION_PROMPT = textwrap.dedent("""
Extract all APIs from the following documentation section.
Return a JSON object with this exact structure:

{
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
        "signed_fields": ["field1", "field2"],
        "signature_location": "header|body|null",
        "token_source_api": "string|null"
      },
      "request": {
        "example_json": "string|null",
        "fields": [
          {
            "location": "header|body|query",
            "name": "string",
            "description": "string (English)",
            "data_type": "String|Number|Object|Array|Boolean|Date|null",
            "max_length": null,
            "is_required": true,
            "default_value": "string|null",
            "constraints": "string|null",
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
          "result_status": "SENTOTP-FAILED|null",
          "result_code": "2007|null",
          "result_message": "string|null",
          "condition": "string|null",
          "confidence_score": 0.9
        }
      ]
    }
  ]
}

Rules:
- exposed_by: if the API path/description says "[Partner] exposes" or callback from bank → "Bank", otherwise "Monee"
- is_encrypted: true if the field is marked as sensitive/encrypted/red field
- is_deprecated: true if field has strikethrough markers (~~text~~) or is explicitly deprecated
- For nested objects, put child fields in the "children" array of the parent field
- Extract ALL result code rows from inline tables (resultStatus + resultCode + resultMessage)
- signed_fields: ordered list of field names used to build the signature string

Documentation section:
---
{content}
---
""").strip()

_FLOW_EXTRACTION_PROMPT = textwrap.dedent("""
Extract the API integration flow from this documentation.
Return a JSON object:

{
  "flow": {
    "name": "string",
    "description": "string (English)",
    "steps": [
      {
        "order": 1,
        "label": "string (English, concise)",
        "actor_from": "string (e.g. Monee, Bank, Customer)",
        "actor_to": "string",
        "api_name": "string|null"
      }
    ]
  }
}

Documentation:
---
{content}
---
""").strip()

_EDGE_CASE_PROMPT = textwrap.dedent("""
Extract edge case handling logic from this documentation.
Return a JSON object:

{
  "edge_cases": [
    {
      "api_name": "string",
      "result_code": "string|null",
      "result_status": "string|null",
      "condition": "string (English)|null",
      "action": "retry|inquiry|next_step|fail|end_flow",
      "retry_max": null,
      "retry_interval_sec": null,
      "next_api_name": "string|null",
      "notes": "string (English)|null"
    }
  ]
}

Documentation:
---
{content}
---
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
    raw = response.text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


# ─── Public extraction functions ──────────────────────────────

def extract_apis(section_content: str) -> dict:
    """Extract APIs + fields + errors from a Markdown section."""
    prompt = _API_EXTRACTION_PROMPT.replace("{content}", section_content)
    try:
        return _call_llm(prompt)
    except Exception as e:
        return {"apis": [], "_error": str(e)}


def extract_flow(section_content: str) -> dict:
    """Extract flow steps from a Markdown section."""
    prompt = _FLOW_EXTRACTION_PROMPT.replace("{content}", section_content)
    try:
        return _call_llm(prompt)
    except Exception as e:
        return {"flow": None, "_error": str(e)}


def extract_edge_cases(section_content: str) -> dict:
    """Extract edge case handling logic."""
    prompt = _EDGE_CASE_PROMPT.replace("{content}", section_content)
    try:
        return _call_llm(prompt)
    except Exception as e:
        return {"edge_cases": [], "_error": str(e)}


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
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception:
        return {
            "name": filename,
            "partner_name": None,
            "flow_name": None,
            "version": None,
            "doc_date": None,
        }
