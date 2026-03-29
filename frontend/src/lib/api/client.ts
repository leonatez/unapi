const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Documents
  listDocuments: () => req<Document[]>("/documents/"),
  getDocument: (id: string) => req<Document>(`/documents/${id}`),
  deleteDocument: (id: string) => req(`/documents/${id}`, { method: "DELETE" }),
  uploadDocument: (form: FormData) =>
    fetch(`${BASE}/documents/upload`, { method: "POST", body: form }).then((r) => r.json()),

  // Pipeline
  updateMarkdown: (id: string, markdown: string) =>
    req<{ status: string; pipeline_status: string }>(`/documents/${id}/markdown`, {
      method: "PATCH",
      body: JSON.stringify({ markdown }),
    }),
  listDocumentVariables: (id: string) => req<DocumentVariable[]>(`/documents/${id}/variables`),
  createDocumentVariable: (id: string, data: Partial<DocumentVariable>) =>
    req<DocumentVariable>(`/documents/${id}/variables`, { method: "POST", body: JSON.stringify(data) }),
  updateDocumentVariable: (id: string, varId: string, data: Partial<DocumentVariable>) =>
    req<DocumentVariable>(`/documents/${id}/variables/${varId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDocumentVariable: (id: string, varId: string) =>
    req<void>(`/documents/${id}/variables/${varId}`, { method: "DELETE" }),
  selectSheets: (
    id: string,
    selectedSheets: string[],
    sheetKinds: Record<string, string>,
    flowSequence?: Record<string, { sheet_name: string; label: string }[]>,
  ) =>
    req<{ status: string; gemini_file_uri: string }>(`/documents/${id}/select-sheets`, {
      method: "POST",
      body: JSON.stringify({
        selected_sheets: selectedSheets,
        sheet_kinds: sheetKinds,
        flow_sequence: flowSequence ?? {},
      }),
    }),
  extractDocument: (id: string) =>
    req<{ status: string; draft: ExtractionDraft }>(`/documents/${id}/extract`, { method: "POST" }),
  getExtractionDraft: (id: string) =>
    req<{ pipeline_status: string; draft: ExtractionDraft }>(`/documents/${id}/extraction`),
  approveExtraction: (id: string) =>
    req<{ status: string; document_id: string; flows: number; apis: number; edge_cases: number }>(
      `/documents/${id}/approve`,
      { method: "POST" }
    ),

  // APIs — read
  listApis: (documentId?: string, flowId?: string) => {
    const params = new URLSearchParams();
    if (documentId) params.set("document_id", documentId);
    if (flowId) params.set("flow_id", flowId);
    const qs = params.toString();
    return req<ApiDef[]>(`/apis/${qs ? `?${qs}` : ""}`);
  },
  getApi: (id: string) => req<ApiDef>(`/apis/${id}`),
  getApiErrors: (id: string) => req<ApiError[]>(`/apis/${id}/errors`),
  getApiEdgeCases: (id: string) => req<EdgeCase[]>(`/apis/${id}/edge-cases`),

  // APIs — edit
  updateApi: (id: string, data: Partial<Pick<ApiDef, "name" | "description" | "method" | "path" | "exposed_by" | "is_idempotent">>) =>
    req<ApiDef>(`/apis/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Fields
  createField: (apiId: string, data: CreateFieldPayload) =>
    req<ApiField>(`/apis/${apiId}/fields`, { method: "POST", body: JSON.stringify(data) }),
  updateField: (apiId: string, fieldId: string, data: Partial<ApiField>) =>
    req<ApiField>(`/apis/${apiId}/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteField: (apiId: string, fieldId: string) =>
    req<void>(`/apis/${apiId}/fields/${fieldId}`, { method: "DELETE" }),

  // Errors
  createError: (apiId: string, data: Partial<ApiError>) =>
    req<ApiError>(`/apis/${apiId}/errors`, { method: "POST", body: JSON.stringify(data) }),
  updateError: (apiId: string, errorId: string, data: Partial<ApiError>) =>
    req<ApiError>(`/apis/${apiId}/errors/${errorId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteError: (apiId: string, errorId: string) =>
    req<void>(`/apis/${apiId}/errors/${errorId}`, { method: "DELETE" }),

  // AI re-extraction for a single API
  reextractApi: (apiId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return fetch(`${BASE}/apis/${apiId}/reextract`, { method: "POST", body: form }).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.detail || r.statusText)));
      return r.json() as Promise<ApiDef>;
    });
  },

  // Flows — read
  listFlows: (documentId?: string) =>
    req<Flow[]>(`/flows/${documentId ? `?document_id=${documentId}` : ""}`),
  getFlow: (id: string) => req<Flow>(`/flows/${id}`),
  getFlowMermaid: (id: string) => req<{ mermaid: string }>(`/flows/${id}/mermaid`),

  // Flows — edit
  updateFlow: (id: string, data: Partial<Pick<Flow, "name" | "description">>) =>
    req<Flow>(`/flows/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  createStep: (flowId: string, data: Partial<FlowStep>) =>
    req<FlowStep>(`/flows/${flowId}/steps`, { method: "POST", body: JSON.stringify(data) }),
  updateStep: (flowId: string, stepId: string, data: Partial<FlowStep>) =>
    req<FlowStep>(`/flows/${flowId}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteStep: (flowId: string, stepId: string) =>
    req<void>(`/flows/${flowId}/steps/${stepId}`, { method: "DELETE" }),

  // Compare
  compare: (docAId: string, docBId: string) =>
    req<CompareResult>("/compare/", {
      method: "POST",
      body: JSON.stringify({ doc_a_id: docAId, doc_b_id: docBId }),
    }),

  // Export
  exportPostman: (docId: string) => `${BASE}/export/${docId}/postman`,
  exportOpenApi: (docId: string) => `${BASE}/export/${docId}/openapi`,

  // Admin — prompts
  listPrompts: () => req<Record<string, { label: string; description: string; value: string }>>("/admin/prompts"),
  updatePrompt: (key: string, value: string) =>
    req<{ status: string; key: string }>(`/admin/prompts/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    }),
  resetPrompt: (key: string) =>
    req<{ status: string; key: string; value: string }>(`/admin/prompts/${key}/reset`, { method: "POST" }),
};

// Types
export interface Document {
  id: string;
  name: string;
  owner: "Monee" | "Bank";
  partner_name?: string;
  flow_name?: string;
  version?: string;
  doc_date?: string;
  raw_format: string;
  pipeline_status:
    | "pending_sheet_selection"
    | "file_ready"
    | "markdown_ready"
    | "extracting"
    | "extraction_review"
    | "complete";
  parser: string;
  created_at: string;
}

export interface SheetInfo {
  name: string;
  row_count: number;
  col_count: number;
  preview: string[][];
}

export interface ApiDef {
  id: string;
  flow_id: string;
  name: string;
  description?: string;
  method?: string;
  path?: string;
  exposed_by: "Monee" | "Bank";
  is_idempotent: boolean;
  confidence_score: number;
  security_profile?: SecurityProfile;
  api_message?: ApiMessage[];
}

export interface ApiMessage {
  id: string;
  message_type: "request" | "response" | "request_header" | "response_header";
  example_json?: string;
  api_field?: ApiField[];
}

export interface ApiField {
  id: string;
  name: string;
  description?: string;
  data_type?: string;
  max_length?: number;
  is_required: boolean;
  default_value?: string;
  constraints?: string;
  value_logic?: string;
  is_encrypted: boolean;
  is_deprecated: boolean;
  confidence_score: number;
  parent_field_id?: string;
  document_variable_id?: string;
  api_field_enum?: { value: string; label?: string }[];
}

export interface CreateFieldPayload {
  message_type: "request" | "response" | "request_header" | "response_header";
  name: string;
  description?: string;
  data_type?: string;
  max_length?: number;
  is_required?: boolean;
  default_value?: string;
  constraints?: string;
  value_logic?: string;
  is_encrypted?: boolean;
  is_deprecated?: boolean;
  parent_field_id?: string;
  document_variable_id?: string;
}

export interface ApiError {
  id: string;
  http_status?: number;
  result_status?: string;
  result_code?: string;
  result_message?: string;
  condition?: string;
}

export interface EdgeCase {
  id: string;
  condition?: string;
  action: string;
  retry_max?: number;
  retry_interval_sec?: number;
  notes?: string;
}

export interface DocumentVariable {
  id: string;
  document_id: string;
  name: string;
  data_type?: string;
  is_enum: boolean;
  value?: string;
  enum_values?: string[];
  description?: string;
  created_at: string;
}

export interface SecurityProfile {
  auth_type?: string;
  algorithm?: string;
  signed_fields?: string[];
  sig_location?: string;
  token_source_api?: string;
}

export interface Flow {
  id: string;
  document_id?: string;
  name: string;
  description?: string;
  mermaid_source?: string;
  flow_step?: FlowStep[];
  /** APIs that belong directly to this flow (via flow_id FK) */
  api?: FlowApi[];
}

export interface FlowApi {
  id: string;
  name: string;
  method?: string;
  path?: string;
  exposed_by?: string;
  confidence_score?: number;
}

export interface FlowStep {
  id: string;
  step_order: number;
  label: string;
  actor_from?: string;
  actor_to?: string;
  api_id?: string;
  api?: { id: string; name: string; method?: string; path?: string };
}

export interface ExtractionDraftApi {
  name: string;
  method?: string;
  path?: string;
  exposed_by?: string;
  description?: string;
  confidence_score?: number;
  errors?: unknown[];
  edge_cases?: unknown[];
}

export interface ExtractionDraftFlow {
  name: string;
  description?: string;
  steps?: unknown[];
  apis: ExtractionDraftApi[];
}

export interface ExtractionDraft {
  flows: ExtractionDraftFlow[];
  _error?: string;
}

export interface DiffItem {
  api_name?: string;
  field_path: string;
  aspect: string;
  value_a?: string;
  value_b?: string;
  severity: "breaking" | "risky" | "info";
  notes?: string;
}

export interface CompareResult {
  summary: { breaking: number; risky: number; info: number; total: number };
  diffs: DiffItem[];
}
