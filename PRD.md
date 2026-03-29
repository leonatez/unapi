# 📘 Product Requirements Document (PRD)

## API Contract Intelligence Platform

---

# 1. 🧭 Overview

## 1.1 Product Vision

Build an **open-source API Contract Intelligence Platform** that transforms fragmented, inconsistent API documentation (PDF, Google Docs, Google Sheets, Excel/XLSX, DOCX, Markdown) into a **structured, queryable, and comparable knowledge system**.

The platform enables teams (especially fintech/integration-heavy orgs) to:

* Normalize API documentation into a **canonical data model**
* Detect **mismatches between our internal doc and a partner's doc** for the same API
* Visualize API flows with **interactive diagrams**
* Understand runtime behavior via **edge-case handling**
* Query and interact with API knowledge using **LLM-powered chat**

---

## 1.2 Problem Statement

Teams integrating APIs across organizations face recurring issues:

### ❌ Pain Points

1. **Duplicate documentation across parties**

   * Same API described differently → frequent mismatches between internal doc and partner doc

2. **Inconsistent documentation format**

   * No standard → hard to maintain or parse (DOCX tables, multi-sheet XLSX, Markdown, etc.)

3. **Manual lookup inefficiency**

   * Hard to quickly answer questions about APIs

4. **Hidden business logic**

   * Retry, error handling, and flows are buried in complex table structures

5. **No reliable comparison mechanism**

   * Difficult to identify breaking changes or inconsistencies between internal and partner versions

---

## 1.3 Solution

A system that:

* Ingests API documentation from multiple formats (including multi-sheet Excel with 40+ sheets)
* Converts it into a **structured canonical database**
* Enables:

  * Visualization (flow + API spec)
  * Comparison (diff engine — internal vs partner doc only)
  * Query (structured + LLM)
  * Export (Postman, OpenAPI)

---

# 2. 🎯 Goals & Objectives

## 2.1 Primary Goals

* Create a **single source of truth** for API contracts
* Reduce **integration errors and mismatches**
* Enable **fast API understanding and debugging**
* Provide **machine-readable API knowledge**

## 2.2 Success Metrics

* ⏱ Reduce time to understand an API by 50%
* 🐞 Reduce integration bugs caused by mismatch
* 🔍 Increase accuracy of API comparison
* 🤖 Enable >80% correct answers from LLM queries

---

# 3. 👤 Target Users

### Primary Users

* Technical Product Managers
* Integration Leads
* Solution Architects
* Backend Engineers (mid–senior)

### Secondary Users

* QA Engineers
* Technical Support teams

---

# 4. 🧱 Core Features

---

## 4.1 Document Ingestion & Parsing

### Input Formats

* PDF
* DOCX (Word)
* XLSX / Excel (local files, multi-sheet)
* Markdown

### Ingestion Paths

Two paths exist depending on file type:

#### XLSX Path — 4-step pipeline with hybrid text + image extraction

Gemini does not support XLSX as a native file input (MIME type rejected). Instead, XLSX files are processed via a hybrid approach: tabular data is converted to text, and embedded images are extracted and uploaded separately. Both are sent together in a single Gemini `generate_content` call.

**Step 1 — Upload**
User uploads the XLSX file. The backend saves it to disk and reads sheet metadata using `openpyxl` (read-only). Returns sheet names and up to 6 preview rows per sheet. No AI involved — sub-second.

**Step 2 — Sheet Selection**
User chooses which sheets to include. UI provides:
- Checkbox per sheet with pre-selection based on auto-detected kind
- Editable kind badge (click to change inline): **Flow · API Spec · Error Codes · Edge Cases · Mapping · Metadata**
- Live preview panel showing the sheet's first 5 data rows when clicked

Kind auto-detection runs entirely client-side (no AI) using regex on sheet name + preview content:

| Kind | Detection rule |
|---|---|
| **Flow** | Sheet **name** matches `flow\|sequence\|diagram\|workflow` (name takes priority) |
| API Spec | Preview cells contain `url\|method\|request\|response\|endpoint\|path` |
| Error Codes | Preview cells contain `error.?code\|result.?code\|result.?status` |
| Edge Cases | Preview cells contain `edge.?case\|retry\|inquiry\|handling.?logic` |
| Mapping | Preview cells contain `mapping\|lookup\|province.?code` |
| Metadata | Changelog/revision keywords, or catch-all |

Flow names are normalized (trim + collapse multiple spaces; case-insensitive deduplication).

All resolved kinds — including user corrections — are sent to Gemini as prompt context. Pre-selection: Flow, API Spec, Error Codes, Edge Cases checked by default; Metadata and Mapping unchecked.

**Step 3 — Flow Sequencer** *(optional)*
User defines the exact API call order per flow. This step can be skipped — if skipped, Gemini infers sequence from diagrams.

- Flow tabs auto-populate from sheets labeled "Flow". Custom flow names can be added inline.
- Left panel: API Spec sheets — click to append to the active flow's sequence.
- Right panel: ordered step list with editable step label, up/down reorder, and remove buttons.
- The same API sheet can be added multiple times (e.g. a callback called at multiple stages).

When provided, the sequence is included in the Gemini prompt as structured hints:
```
Flow sequence hints:
  Flow "OTP Verification Flow":
    Step 1: "OTP Initiation API" sheet — Initiate OTP Request
    Step 2: "OTP API" sheet — Resend OTP (optional)
    Step 3: "OTP Verification API" sheet — Verify OTP Code
    Step 4: "Callback API" sheet — Send Success Notification
```

**Step 4 — Extraction Review**
Gemini receives the selected sheets as markdown tables (text) plus any embedded images (PNG/JPEG) extracted from those sheets via `openpyxl` and uploaded to the Gemini File API individually. Sheet kind labels and flow sequence hints (from steps 2–3) are injected as structured prompt context. The extracted flows and APIs are displayed for user review. User can approve or go back.

Gemini response normalization: the model may return either `{"flows": [...]}` or a bare `[...]` list — both are handled and normalized to the canonical shape before persisting.

#### Non-XLSX Path — 3-step pipeline with markitdown

For DOCX, PDF, and Markdown files:

1. Upload → `markitdown` converts file to Markdown text
2. Markdown Review → user can edit the Markdown before extraction (fix tables, remove noise)
3. Extraction Review → same review step as XLSX

### Requirements

* Preserve the raw file on disk for Gemini File API re-use
* Store markdown content when available (non-XLSX or as a fallback)
* **Confidence scoring** (soft flag) for parsed fields — low-confidence fields are flagged but do not block processing
* Extract content regardless of language — normalize all descriptions to **English** in the canonical model
* Handle merged cells and nested inline tables in DOCX/XLSX

---

## 4.2 Canonical API Model

Each API must support:

### API Definition

* Name, description
* Method, path
* Idempotency
* **`exposed_by`**: enum `"Monee"` | `"Bank"` — which party exposes this API
* Security profile reference

### Request / Response

* **Headers** — stored as a dedicated message type (`request_header` / `response_header`) separate from the body, rendered in a stacked layout in the UI (Headers table above Body table)
* Body fields (nested)
* Data types
* Required flags
* Default values
* Constraints (regex, min/max, rules)
* **`value_logic`**: string — sample value (e.g. `VCB001`), fixed/constant value (e.g. `Fixed: PAYMENT`), or conditional logic (e.g. `If type=A then X; if type=B then Y`) as shown in the source document
* **`is_encrypted`**: bool — field-level encryption flag (e.g., "red fields" in partner docs)
* **`is_deprecated`**: bool — field is deprecated (strikethrough in source doc)
* **`document_variable_id`**: FK reference — links a field to a global Document Variable instead of a hardcoded value

### Document Variables

Each document can define a set of **reusable global variables** (e.g., `clientId`, environment keys, shared constants) that can be referenced across many fields within that document.

* Stored in the `document_variable` table, associated with a single `api_document`
* Each variable has: `name`, `data_type`, `is_enum` (bool), `value` (scalar), `enum_values` (array), `description`
* Variables are managed via a dedicated **Variables Panel** in the document sidebar — supports create, inline edit, and delete
* When a variable is assigned to a field (`document_variable_id`), the `value_logic` text input is hidden and replaced by the variable reference badge in the spec view

### Enum Support

* Explicit enum values per field

### Error Handling

The canonical error model explicitly captures the **resultStatus + resultCode + resultMessage** triplet used in fintech API patterns:

* HTTP status code
* `resultStatus` — machine-readable status category (e.g., `SENTOTP-SUCCESS`, `VERIOTP-FAILED`)
* `resultCode` — business code (e.g., `200`, `2007`)
* `resultMessage` — human-readable message
* Condition (when this error applies)

### Samples

* Request/response examples
* cURL examples (optional)

---

## 4.3 Security Profile

Each API or document can reference a `security_profile` capturing:

* **Authentication type** (Bearer token, API key, etc.)
* **Signature algorithm** (e.g., `SHA256withRSA`)
* **Signed fields** — ordered list of fields used to construct the signature (e.g., `["username", "externalApplyNo", "requestId"]`)
* **Signature location** — `header` | `body`
* **Token source** — which API provides the auth token

---

## 4.4 Flow Visualization (Mermaid-based)

### Capabilities

* Store and render Mermaid sequence diagrams
* Represent full API flow

### Interaction

* Each step is linked to an API
* Clicking a step:
  → opens API spec (side panel)

### Requirements

* Flow steps stored in DB
* Mermaid used only for visualization
* Mapping:

  ```
  flow_step → api_id
  ```

---

## 4.5 Edge Case Handling Engine

### Purpose

Capture runtime logic such as:

* Retry
* Inquiry
* Fail
* Next step transitions

### Structure

Each edge case includes:

* API reference
* Error code reference
* Condition (optional)
* Action:

  * retry
  * inquiry
  * next_step
  * fail
  * end_flow
* Retry policy
* Next API (optional)

### Outcome

* Enables:

  * Queryable logic
  * Visualization
  * LLM reasoning

---

## 4.6 API Comparison (Diff Engine)

### Scope

Compare **our internal doc vs a partner's doc for the same API**. Cross-partner comparison is out of scope.

### Capabilities

* Compare:

  * Field presence (added / removed)
  * Field type
  * Required vs optional
  * Enum differences
  * Default value differences
  * `is_encrypted` / `is_deprecated` flag differences
  * Error code / resultCode differences
  * Signature field list differences

### Output

* Highlight:

  * Breaking changes 🚨
  * Risky changes ⚠️
  * Informational differences ℹ️

---

## 4.7 LLM-powered Query Interface

### Example Queries

* "Which APIs require OTP?"
* "What happens if resultCode = 2007?"
* "Compare this API with partner version"

### Architecture

* LLM queries structured DB (NOT raw text)
* Prevent hallucination via schema grounding

---

## 4.8 Export Capabilities

* Postman Collection
* OpenAPI (partial or full)
* Markdown documentation

---

## 4.9 Human-in-the-Loop (HITL) Review

### Why It Exists

LLM extraction is probabilistic. On real-world fintech docs — multilingual tables, merged cells, deeply nested schemas — the model may misclassify fields, miss enums, or produce incorrect types. The confidence score system flags these cases, but a human must resolve them before the data is trusted for comparison or export.

HITL is not optional polish — it is the **quality gate** between raw LLM output and a trusted canonical record.

### Where It Applies

HITL review is triggered at two levels:

1. **Field-level**: any `api_field`, `api_error`, or `api` record where `confidence_score < threshold` (default: 0.85)
2. **Document-level**: after initial ingestion, a reviewer can inspect the full extracted tree and accept, edit, or reject any node

### Review Workflow

```
Upload Document
     │
     ▼
LLM Extraction (automated)
     │
     ▼
Confidence Scoring per field
     │
     ├─── All fields high confidence ───► Auto-accepted, document marked "verified"
     │
     └─── Low-confidence flags exist ──► Document enters "needs review" state
                                               │
                                               ▼
                                    Reviewer opens API spec panel
                                    Flagged fields highlighted in UI
                                               │
                                    ┌──────────┴──────────┐
                                    │                     │
                               Accept as-is          Edit value
                                    │                     │
                                    └──────────┬──────────┘
                                               ▼
                                    Field marked "human-verified"
                                    confidence_score set to 1.0
                                               │
                                               ▼
                                    Document fully verified
                                    → safe for diff / export
```

### Data Model Impact

Each reviewed entity carries:

* `confidence_score` — LLM-assigned (0.0–1.0), reset to `1.0` after human correction
* `is_human_verified` — bool flag set when a reviewer explicitly accepts or edits the value
* `review_note` — optional freetext from reviewer (e.g. "source doc uses Vietnamese shorthand")

### Review States (Document Level)

| State | Meaning |
|---|---|
| `pending` | Upload complete, extraction in progress |
| `needs_review` | Extraction done; one or more low-confidence fields exist |
| `verified` | All fields human-verified or above confidence threshold |
| `rejected` | Reviewer determined extraction is too poor; document must be re-uploaded |

### UI Behavior

* Flagged fields rendered with a yellow ⚠️ badge in the API spec panel
* Reviewer can inline-edit any field value directly in the spec panel
* "Approve all above 0.9" bulk action for high-volume docs
* Progress indicator: `X of Y fields verified`
* Documents in `needs_review` state are excluded from diff comparisons until verified

### Design Principle

> **LLM extracts. Humans certify. The diff engine only runs on certified data.**

This ensures that breaking-change detection is never a false positive caused by a parsing error — it is always a real divergence between two human-verified documents.

---

# 5. 🗂️ Data Model (Summary)

## Key Entities

* `api_document` — source doc with metadata (partner name, flow name, version, date, revision history, `owner`: `"Monee"` | `"Bank"`)
* `api` — canonical API definition (includes `exposed_by`)
* `api_message` — request/response container; `message_type` enum: `request` | `response` | `request_header` | `response_header`
* `api_field` — individual field (includes `value_logic`, `is_encrypted`, `is_deprecated`, `confidence_score`, `document_variable_id`)
* `api_field_enum` — enum values
* `api_error` — error entry with resultStatus + resultCode + resultMessage triplet
* `security_profile` — auth + signature details
* `flow` — named integration flow
* `flow_step` — step in a flow, linked to `api`
* `edge_case` — runtime handling logic
* `environment` — host/base URL per environment
* `document_variable` — reusable named variable scoped to a document; supports scalar and enum types

### Design Principles

* API is atomic
* Flow orchestrates APIs
* Edge cases represent runtime logic
* Mermaid is view layer only
* Confidence scores are soft flags — they inform but never block

---

# 6. 🧩 User Experience

## Main Interface

### Layout

```
-----------------------------------------
| Flow Diagram (Mermaid)               |
-----------------------------------------
| API Spec Panel (on click)            |
| - Endpoint                           |
| - Request                            |
| - Response                           |
| - Errors                             |
| - Edge handling                      |
-----------------------------------------
```

---

## Key Interactions

### Flow Navigation

* Click step → open API detail

### API Exploration

* Expand schema tree
* View enums and constraints
* See deprecated / encrypted field badges
* **Headers + Body stacked**: Request and Response tabs each render two consecutive tables — Headers on top, Body below
* **Variable badge**: fields linked to a Document Variable show the variable name as a badge instead of raw value_logic text
* **Re-extract**: upload new screenshots or markdown snippets to re-run AI extraction for a single API without re-processing the full document

### Document Variables Management

* Accessible from the left sidebar of each document via the **Variables Panel**
* Create, rename, change type, toggle enum mode, and delete variables inline
* Enum variables show comma-separated options during edit; stored as an array

### Edge Case Inspection

* View handling per error code

### Comparison View

* Side-by-side diff: internal doc vs partner doc
* Severity badges per diff

---

# 7. ⚙️ Technical Architecture

## Backend

* FastAPI (Python 3.11+)
* Supabase (PostgreSQL via `supabase-py`)
* JSONB columns for `extraction_draft`, `sheet_kinds`, `flow_sequence`

## Parsing Layer

* **XLSX:** `openpyxl` (read-only sheet listing + preview) → selected sheets converted to markdown tables + embedded images extracted and uploaded to Gemini File API → single `generate_content` call with text + images + hints
* **Non-XLSX:** `markitdown` → Markdown text → Gemini text prompt
* Sheet classifier: client-side regex (instant, no AI cost) with user override
* LLM extraction: Google Gemini via `google-generativeai` SDK (model configurable, default `gemini-2.0-flash`)
* Gemini File URI storage: full URI stored in DB (`https://generativelanguage.googleapis.com/v1beta/files/<id>`); name portion is extracted at call time since `genai.get_file()` accepts only the name
* Language: extract in any language, normalize to English
* Prompt design: structured sheet context block + optional flow sequence hints injected before the schema extraction request
* Response normalization: bare JSON array from model is wrapped into `{"flows": [...]}` before processing

## Frontend

* Next.js (App Router), TypeScript
* Tailwind CSS
* Lucide React icons

## LLM Layer

* Structured query engine (planned)
* RAG over DB (planned)

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_KEY` | Supabase project credentials |
| `GEMINI_API_KEY` | Google AI API key |
| `GEMINI_MODEL` | Gemini model name (default: `gemini-2.0-flash`) |
| `UPLOAD_DIR` | Local file storage path (default: `/tmp/unapi_uploads`) |
| `NEXT_PUBLIC_API_URL` | Backend API base URL (baked into Next.js at Docker build time) |

---

# 8. 🚧 MVP Scope (Recommended)

## Include

* Document ingestion (DOCX, XLSX, Markdown)
* Sheet classification for XLSX
* API schema storage with all canonical fields
* `exposed_by` and field-level `is_encrypted` / `is_deprecated`
* Flow visualization
* Click-to-view API spec
* Basic edge case support
* Full diff engine (internal vs partner)
* Security profile capture

## Exclude (later)

* Advanced LLM reasoning / chat
* State machine modeling
* Google Docs / Google Sheets live sync
* PDF support

---

# 8b. 🗄️ DB Migrations

Applied to Supabase in order:

| Migration | Description |
|---|---|
| `001_initial_schema.sql` | Core tables: `api_document`, `flow`, `api`, `api_message`, `api_field`, `api_error`, `edge_case` |
| `002_data_model_refactor.sql` | `flow_step`, `security_profile`, `api_field_enum`, `diff_result`; `extraction_draft jsonb`, `sheet_kinds jsonb`, `flow_sequence jsonb`; `api.flow_id` FK replacing `document_id`; cascade deletes |
| `003_gemini_file_api.sql` | `gemini_file_uri text`, `selected_sheets text[]` on `api_document`; new pipeline statuses `pending_sheet_selection` and `file_ready` |
| `004_value_logic.sql` | `value_logic text` on `api_field` — sample value, fixed constant, or conditional logic string extracted from source doc |
| `005_headers_and_variables.sql` | Adds `request_header` and `response_header` to `message_type_enum`; creates `document_variable` table (scoped to `api_document`); adds `document_variable_id uuid` FK on `api_field` with cascade delete |

**`pipeline_status` value lifecycle:**
```
XLSX:     pending_sheet_selection → file_ready → extracting → extraction_review → complete
Non-XLSX: markdown_ready          →             extracting → extraction_review → complete
```

---

# 9. ⚠️ Risks & Mitigations

| Risk                              | Mitigation                                        |
| --------------------------------- | ------------------------------------------------- |
| LLM parsing errors                | Confidence scoring (soft flag), HITL review pipeline |
| Token cost for large XLSX files   | Sheet Selection step — user chooses only relevant sheets before file is sent to Gemini |
| Images and diagrams lost in parsing | XLSX embedded images extracted via `openpyxl` and uploaded to Gemini File API as individual image files; tabular data sent as markdown text in the same call |
| AI misses flow step order         | Flow Sequencer step (optional) — user defines call order; sent as structured prompt hints |
| Complex XLSX (merged cells, 40+ sheets) | Sheet classifier (instant, client-side) + user-editable kind labels |
| Multilingual docs (e.g. Vietnamese) | LLM normalizes to English in canonical model    |
| Inline nested tables in DOCX      | Special extraction pass for status mapping tables |
| Schema mismatch                   | Validation rules on canonical model              |
| Gemini File API file expiry       | Raw file kept on disk; can be re-uploaded if URI expires |

---

# 10. 🚀 CI/CD & Deployment

This project is hosted on a mini PC running CapRover. Every push to GitHub auto-deploys via CapRover webhooks.

| Service | Domain | Container Port | CapRover App |
|---|---|---|---|
| Backend (FastAPI) | `unapi-api.crawlingrobo.com` | 1113 | `unapi-api` |
| Frontend (Next.js) | `unapi.crawlingrobo.com` | 1114 | `unapi` |

* **Backend**: FastAPI Docker container (`backend/Dockerfile`), deployed from `backend/` directory using `backend/captain-definition`
* **Frontend**: Next.js standalone Docker container (`frontend/Dockerfile`), deployed from `frontend/` directory; `NEXT_PUBLIC_API_URL` is baked in at Docker build time via `ARG`
* **DB**: Supabase (external managed PostgreSQL)

### Deploy commands
```bash
# Backend
cd backend/ && caprover deploy --appName unapi-api

# Frontend
cd frontend/ && caprover deploy --appName unapi
```

### Backend environment variables (set in CapRover dashboard)
```
SUPABASE_URL=...
SUPABASE_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
UPLOAD_DIR=/tmp/unapi_uploads
```

---

# 11. 🧠 Key Insight

This product is not just an API documentation tool.

> It is an **API Contract Intelligence Engine**

It transforms:

* Static documentation → dynamic system knowledge
* Human-readable → machine-queryable
* Fragmented docs → unified truth

The comparison is always **internal vs partner** for the same API — making it a precision instrument for detecting integration drift before it causes production incidents.

---

# 12. 📦 Open Source Strategy

## Goals

* Attract developer adoption
* Build ecosystem around API standardization
* Encourage contributions for parsers and exporters

## Suggested Modules

* `parser-engine`
* `api-schema-core`
* `flow-engine`
* `edge-case-engine`
* `ui-viewer`

---

# 13. 🏁 Conclusion

This platform solves a real and painful problem in API integrations, especially in complex domains like fintech.

With the right execution, it can become:

* A **developer tool**
* A **product manager assistant**
* A **system integration backbone**

---
