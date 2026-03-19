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
* Google Docs
* Google Sheets
* Markdown

### Pipeline

1. Upload document
2. Convert to Markdown (using library `markitdown`)
3. **Sheet classification** (for XLSX/multi-tab docs): classify each sheet/section as:
   - `api_spec` — contains an API definition
   - `error_code` — reference error/result code table
   - `edge_case` — runtime handling logic
   - `mapping` — code/value mapping table
   - `metadata` — changelog, environment, general info
4. LLM extracts structured data per classified section
5. Store into canonical DB

### Requirements

* Preserve raw + intermediate (Markdown) formats
* Support re-processing
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

* Headers
* Body fields (nested)
* Data types
* Required flags
* Default values
* Constraints (regex, min/max, rules)
* **`is_encrypted`**: bool — field-level encryption flag (e.g., "red fields" in partner docs)
* **`is_deprecated`**: bool — field is deprecated (strikethrough in source doc)

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

# 5. 🗂️ Data Model (Summary)

## Key Entities

* `api_document` — source doc with metadata (partner name, flow name, version, date, revision history, `owner`: `"Monee"` | `"Bank"`)
* `api` — canonical API definition (includes `exposed_by`)
* `api_message` — request/response container
* `api_field` — individual field (includes `is_encrypted`, `is_deprecated`, `confidence_score`)
* `api_field_enum` — enum values
* `api_error` — error entry with resultStatus + resultCode + resultMessage triplet
* `security_profile` — auth + signature details
* `flow` — named integration flow
* `flow_step` — step in a flow, linked to `api`
* `edge_case` — runtime handling logic
* `environment` — host/base URL per environment

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

### Edge Case Inspection

* View handling per error code

### Comparison View

* Side-by-side diff: internal doc vs partner doc
* Severity badges per diff

---

# 7. ⚙️ Technical Architecture

## Backend

* FastAPI
* Supabase (PostgreSQL)
* Optional: JSONB for schema storage

## Parsing Layer

* Markdown conversion using library `markitdown`
* Sheet/section classifier (rule-based + LLM-assisted)
* LLM extraction: `gemini-3.1-flash-lite-preview` / local LLM
* Language: extract in any language, normalize to English

## Frontend

* React / Next.js
* Mermaid.js for diagrams
* TailwindCSS

## LLM Layer

* Structured query engine
* RAG over DB

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

# 9. ⚠️ Risks & Mitigations

| Risk                              | Mitigation                                        |
| --------------------------------- | ------------------------------------------------- |
| LLM parsing errors                | Confidence scoring (soft flag), human can review  |
| Complex XLSX (merged cells, 40+ sheets) | Sheet classifier + incremental extraction   |
| Multilingual docs (e.g. Vietnamese) | LLM normalizes to English in canonical model    |
| Inline nested tables in DOCX      | Special extraction pass for status mapping tables |
| Schema mismatch                   | Validation rules on canonical model              |
| Over-engineering                  | MVP-first approach                               |

---

# 10. 🚀 CI/CD & Deployment

This project is hosted on a mini PC's Caprover. Every push to GitHub auto-deploys via Caprover.

* Backend: FastAPI Docker container
* Frontend: Next.js Docker container
* DB: Supabase (external managed)

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
