"""
Canonical Pydantic models mirroring the DB schema.
Used for validation, serialization, and LLM extraction targets.
"""
from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class Owner(str, Enum):
    monee = "Monee"
    bank = "Bank"


class HttpMethod(str, Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


class MessageType(str, Enum):
    request = "request"
    response = "response"


class EdgeAction(str, Enum):
    retry = "retry"
    inquiry = "inquiry"
    next_step = "next_step"
    fail = "fail"
    end_flow = "end_flow"


class SignatureLocation(str, Enum):
    header = "header"
    body = "body"


class SheetKind(str, Enum):
    api_spec = "api_spec"
    error_code = "error_code"
    edge_case = "edge_case"
    mapping = "mapping"
    metadata = "metadata"
    unknown = "unknown"


class DiffSeverity(str, Enum):
    breaking = "breaking"
    risky = "risky"
    info = "info"


# ─── Security ─────────────────────────────────────────────────────────────────

class SecurityProfileCreate(BaseModel):
    auth_type: Optional[str] = None           # "Bearer", "API key", etc.
    algorithm: Optional[str] = None           # "SHA256withRSA"
    signed_fields: list[str] = Field(default_factory=list)  # ordered
    signature_location: Optional[SignatureLocation] = None
    token_source_api: Optional[str] = None    # name of token-vending API


# ─── Document ─────────────────────────────────────────────────────────────────

class ApiDocumentCreate(BaseModel):
    name: str
    owner: Owner                              # Monee | Bank
    partner_name: Optional[str] = None
    flow_name: Optional[str] = None
    version: Optional[str] = None
    doc_date: Optional[str] = None
    raw_format: str                           # "docx" | "xlsx" | "md" | "pdf"
    markdown_content: Optional[str] = None   # intermediate after markitdown


# ─── API ──────────────────────────────────────────────────────────────────────

class ApiCreate(BaseModel):
    document_id: str
    name: str
    description: Optional[str] = None
    method: Optional[HttpMethod] = None
    path: Optional[str] = None
    exposed_by: Owner                         # Monee | Bank
    is_idempotent: bool = False
    security_profile: Optional[SecurityProfileCreate] = None
    confidence_score: float = 1.0


# ─── Field ────────────────────────────────────────────────────────────────────

class ApiFieldCreate(BaseModel):
    message_id: str
    parent_field_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    data_type: Optional[str] = None          # String, Number, Object, etc.
    max_length: Optional[int] = None
    is_required: bool = False
    default_value: Optional[str] = None
    constraints: Optional[str] = None        # regex, rules, etc.
    is_encrypted: bool = False
    is_deprecated: bool = False
    confidence_score: float = 1.0
    enums: list[str] = Field(default_factory=list)


# ─── Message ──────────────────────────────────────────────────────────────────

class ApiMessageCreate(BaseModel):
    api_id: str
    message_type: MessageType
    fields: list[ApiFieldCreate] = Field(default_factory=list)
    example_json: Optional[str] = None


# ─── Error ────────────────────────────────────────────────────────────────────

class ApiErrorCreate(BaseModel):
    api_id: str
    http_status: Optional[int] = None
    result_status: Optional[str] = None      # e.g. "SENTOTP-FAILED"
    result_code: Optional[str] = None        # e.g. "2007"
    result_message: Optional[str] = None
    condition: Optional[str] = None
    confidence_score: float = 1.0


# ─── Flow ─────────────────────────────────────────────────────────────────────

class FlowStepCreate(BaseModel):
    order: int
    label: str
    actor_from: Optional[str] = None
    actor_to: Optional[str] = None
    api_id: Optional[str] = None            # linked canonical API


class FlowCreate(BaseModel):
    document_id: str
    name: str
    description: Optional[str] = None
    mermaid_source: Optional[str] = None
    steps: list[FlowStepCreate] = Field(default_factory=list)


# ─── Edge Case ────────────────────────────────────────────────────────────────

class EdgeCaseCreate(BaseModel):
    api_id: str
    error_id: Optional[str] = None
    condition: Optional[str] = None
    action: EdgeAction
    retry_max: Optional[int] = None
    retry_interval_sec: Optional[int] = None
    next_api_id: Optional[str] = None
    notes: Optional[str] = None


# ─── Extraction result (LLM output) ──────────────────────────────────────────

class ExtractedDocument(BaseModel):
    """Full extraction result from LLM for one document/sheet."""
    document: ApiDocumentCreate
    apis: list[dict] = Field(default_factory=list)  # ApiCreate + messages + errors
    flows: list[FlowCreate] = Field(default_factory=list)
    edge_cases: list[EdgeCaseCreate] = Field(default_factory=list)
