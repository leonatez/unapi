"""
Prompt store for all LLM prompts used in the extraction pipeline.

Prompts are loaded from prompts_config.json if it exists, otherwise
defaults defined here are used. The admin API reads/writes this store.

Placeholder conventions (used with simple str.replace):
  {content}      — document markdown text
  {sheet_hint}   — sheet context block injected by extraction functions
  {filename}     — document filename hint
  {api_name}     — target API name for re-extraction
  {method}       — HTTP method
  {path}         — API path
  {exposed_by}   — "Monee" or "Bank"
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_PROMPTS_FILE = Path(__file__).parent / "prompts_config.json"

_DEFAULTS: dict[str, dict] = {
    "system": {
        "label": "System Prompt",
        "description": "Base instructions applied to all LLM calls. Sets the analyst persona and output format rules.",
        "value": (
            "You are an expert API documentation analyst specializing in fintech integrations.\n"
            "Your job is to extract structured data from API documentation (which may be in English, Vietnamese, or mixed).\n"
            "Always output ONLY valid JSON. Normalize all descriptions to English.\n"
            "Be precise. If a value is unclear, use null. Set confidence_score between 0.0 and 1.0."
        ),
    },
    "extract_all": {
        "label": "Extract All (Markdown)",
        "description": "Main extraction prompt for text-based (markdown) documents. {content} is replaced with the document text.",
        "value": """\
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
---""",
    },
    "extract_all_file": {
        "label": "Extract All (File / XLSX)",
        "description": "Extraction prompt for Gemini File API and XLSX with images. {sheet_hint} is replaced with sheet context.",
        "value": """\
Extract all integration flows and their APIs from the attached API documentation.
{sheet_hint}
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
- Pay careful attention to any diagrams, images, or sequence charts in the document — extract flow steps from them""",
    },
    "metadata": {
        "label": "Metadata Extraction",
        "description": "Lightweight prompt to extract document name, partner, version, and date. {filename} and {content} are replaced.",
        "value": """\
Extract document metadata from the following API documentation.
Return JSON:
{
  "name": "string",
  "partner_name": "string|null",
  "flow_name": "string|null",
  "version": "string|null",
  "doc_date": "string|null"
}

Filename hint: {filename}

First 3000 characters of document:
---
{content}
---""",
    },
    "reextract_api": {
        "label": "Re-extract Single API",
        "description": "Re-extract one API spec from screenshots or markdown. Placeholders: {api_name}, {method}, {path}, {exposed_by}.",
        "value": """\
You are re-extracting the specification for a single API from the provided content (screenshots and/or markdown text).

Target API context:
  Name: {api_name}
  Method: {method}
  Path: {path}
  Exposed by: {exposed_by}

Extract ONLY this API. Return a JSON object with this exact structure:

{
  "description": "string (English, 1-2 sentences)|null",
  "method": "GET|POST|PUT|PATCH|DELETE|null",
  "path": "string|null",
  "request": {
    "example_json": "string|null",
    "fields": [
      {
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
      "notes": "string|null"
    }
  ]
}

Rules:
- Focus only on the target API above. Ignore unrelated APIs.
- is_encrypted: true if field is marked sensitive/encrypted
- is_deprecated: true if field has strikethrough or is marked deprecated
- value_logic: extract any sample value (e.g. "VCB001"), fixed/constant value (e.g. "Fixed: PAYMENT"), or conditional logic (e.g. "If type=A then X; if type=B then Y") shown for the field; use null if none present
- For nested objects, put child fields in the "children" array of the parent field
- Extract ALL result code rows from tables (resultStatus + resultCode + resultMessage)
- Normalize all descriptions to English""",
    },
}


def _load() -> dict[str, dict]:
    """Load prompts from file, merging with defaults for any missing keys."""
    base = {k: dict(v) for k, v in _DEFAULTS.items()}
    if _PROMPTS_FILE.exists():
        try:
            saved = json.loads(_PROMPTS_FILE.read_text(encoding="utf-8"))
            for key, entry in saved.items():
                if key in base and "value" in entry:
                    base[key]["value"] = entry["value"]
        except Exception:
            logger.warning("Failed to load prompts_config.json, using defaults", exc_info=True)
    return base


def get_prompt(key: str) -> str:
    """Return the current value of a prompt by key."""
    return _load()[key]["value"]


def list_prompts() -> dict[str, dict]:
    """Return all prompts with label, description, and current value."""
    return _load()


def update_prompt(key: str, value: str) -> None:
    """Persist an updated prompt value to disk."""
    prompts = _load()
    if key not in prompts:
        raise KeyError(f"Unknown prompt key: {key!r}")
    prompts[key]["value"] = value
    to_save = {k: {"value": v["value"]} for k, v in prompts.items()}
    _PROMPTS_FILE.write_text(json.dumps(to_save, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Prompt %r updated and saved to %s", key, _PROMPTS_FILE)


def reset_prompt(key: str) -> None:
    """Reset a single prompt to its default value."""
    if key not in _DEFAULTS:
        raise KeyError(f"Unknown prompt key: {key!r}")
    update_prompt(key, _DEFAULTS[key]["value"])


def get_default(key: str) -> str:
    """Return the default value for a prompt."""
    if key not in _DEFAULTS:
        raise KeyError(f"Unknown prompt key: {key!r}")
    return _DEFAULTS[key]["value"]
