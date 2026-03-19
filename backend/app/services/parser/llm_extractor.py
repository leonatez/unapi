"""
LLM extraction using Google Gemini.
Provides two modes:
  - extract_all(markdown): combined single-pass extraction for the new pipeline
  - extract_document_metadata(markdown, filename): lightweight metadata-only pass
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
