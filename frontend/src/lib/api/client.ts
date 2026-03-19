const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  // Documents
  listDocuments: () => req<Document[]>("/documents/"),
  getDocument: (id: string) => req<Document>(`/documents/${id}`),
  deleteDocument: (id: string) => req(`/documents/${id}`, { method: "DELETE" }),
  uploadDocument: (form: FormData) =>
    fetch(`${BASE}/documents/upload`, { method: "POST", body: form }).then((r) => r.json()),

  // APIs
  listApis: (documentId?: string) =>
    req<ApiDef[]>(`/apis/${documentId ? `?document_id=${documentId}` : ""}`),
  getApi: (id: string) => req<ApiDef>(`/apis/${id}`),
  getApiErrors: (id: string) => req<ApiError[]>(`/apis/${id}/errors`),
  getApiEdgeCases: (id: string) => req<EdgeCase[]>(`/apis/${id}/edge-cases`),

  // Flows
  listFlows: (documentId?: string) =>
    req<Flow[]>(`/flows/${documentId ? `?document_id=${documentId}` : ""}`),
  getFlow: (id: string) => req<Flow>(`/flows/${id}`),
  getFlowMermaid: (id: string) => req<{ mermaid: string }>(`/flows/${id}/mermaid`),

  // Compare
  compare: (docAId: string, docBId: string) =>
    req<CompareResult>("/compare/", {
      method: "POST",
      body: JSON.stringify({ doc_a_id: docAId, doc_b_id: docBId }),
    }),

  // Export
  exportPostman: (docId: string) => `${BASE}/export/${docId}/postman`,
  exportOpenApi: (docId: string) => `${BASE}/export/${docId}/openapi`,
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
  created_at: string;
}

export interface ApiDef {
  id: string;
  document_id: string;
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
  message_type: "request" | "response";
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
  is_encrypted: boolean;
  is_deprecated: boolean;
  confidence_score: number;
  parent_field_id?: string;
  api_field_enum?: { value: string; label?: string }[];
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

export interface SecurityProfile {
  auth_type?: string;
  algorithm?: string;
  signed_fields?: string[];
  sig_location?: string;
  token_source_api?: string;
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  mermaid_source?: string;
  flow_step?: FlowStep[];
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
