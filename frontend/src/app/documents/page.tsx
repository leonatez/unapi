"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  FileText, Loader2, CheckCircle, XCircle,
  Eye, Download, Trash2, Building2, User, ExternalLink,
  ChevronDown, ChevronUp, ArrowRight, RotateCcw,
} from "lucide-react";
import { api, Document, ExtractionDraft, ExtractionDraftFlow } from "@/lib/api/client";

// ─── Pipeline state machine ────────────────────────────────────

type PipelineState =
  | { step: "idle" }
  | { step: "uploading" }
  | { step: "markdown_review"; docId: string; markdown: string }
  | { step: "extracting"; docId: string }
  | { step: "extraction_review"; docId: string; draft: ExtractionDraft }
  | { step: "approving"; docId: string }
  | { step: "done"; docId: string; flows: number; apis: number }
  | { step: "error"; message: string };

const STEP_LABELS = ["1. Upload", "2. Markdown Review", "3. Extraction Review"];

function stepIndex(s: PipelineState["step"]): number {
  if (s === "uploading") return 0;
  if (s === "markdown_review" || s === "extracting") return 1;
  if (s === "extraction_review" || s === "approving") return 2;
  return 3; // done / error / idle
}

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400",
  POST: "text-blue-400",
  PUT: "text-amber-400",
  PATCH: "text-purple-400",
  DELETE: "text-red-400",
};

// ─── Flow preview card ─────────────────────────────────────────

function FlowCard({ flow }: { flow: ExtractionDraftFlow }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 text-left transition-colors"
      >
        <div>
          <span className="font-medium text-white text-sm">{flow.name}</span>
          {flow.description && (
            <span className="ml-3 text-xs text-gray-400 font-normal">{flow.description}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
          <span className="bg-gray-700 px-2 py-0.5 rounded-full">{flow.apis.length} APIs</span>
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-800">
          {flow.apis.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500 italic">No APIs extracted in this flow.</p>
          ) : (
            flow.apis.map((a, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                {a.method ? (
                  <span className={`text-xs font-mono font-bold w-14 shrink-0 ${METHOD_COLORS[a.method] ?? "text-gray-400"}`}>
                    {a.method}
                  </span>
                ) : (
                  <span className="w-14 shrink-0" />
                )}
                <span className="text-sm text-white font-medium">{a.name}</span>
                {a.path && <span className="text-xs text-gray-500 font-mono">{a.path}</span>}
                {a.confidence_score !== undefined && a.confidence_score < 0.7 && (
                  <span className="ml-auto text-xs text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded-full">
                    low confidence
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton card ─────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="p-4 rounded-xl border border-gray-800 bg-gray-900 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-5 w-14 bg-gray-800 rounded-full" />
        <div className="h-4 w-10 bg-gray-800 rounded" />
      </div>
      <div className="h-5 w-48 bg-gray-800 rounded mb-1" />
      <div className="h-4 w-32 bg-gray-800 rounded" />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<"Monee" | "Bank">("Monee");
  const [parser] = useState("markitdown");
  const [pipeline, setPipeline] = useState<PipelineState>({ step: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const markdownRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    const data = await api.listDocuments();
    setDocs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Step 1: Upload → Markdown ────────────────────────────────

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);
    form.append("owner", owner);
    form.append("parser", parser);

    setPipeline({ step: "uploading" });
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/documents/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) {
        setPipeline({ step: "error", message: data?.detail || `Server error ${res.status}` });
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      load();
      setPipeline({ step: "markdown_review", docId: data.document_id, markdown: data.markdown ?? "" });
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  };

  // ── Step 2: AI Extraction ────────────────────────────────────

  const handleExtract = async () => {
    if (pipeline.step !== "markdown_review") return;
    const { docId } = pipeline;
    const markdown = markdownRef.current?.value ?? pipeline.markdown;

    setPipeline({ step: "extracting", docId });
    try {
      await api.updateMarkdown(docId, markdown);
      const res = await api.extractDocument(docId);
      if (res.draft._error) {
        setPipeline({ step: "error", message: `AI extraction failed: ${res.draft._error}` });
        return;
      }
      setPipeline({ step: "extraction_review", docId, draft: res.draft });
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Extraction failed" });
    }
  };

  // ── Step 3: Approve & Save ───────────────────────────────────

  const handleApprove = async () => {
    if (pipeline.step !== "extraction_review") return;
    const { docId } = pipeline;
    setPipeline({ step: "approving", docId });
    try {
      const res = await api.approveExtraction(docId);
      load();
      setPipeline({ step: "done", docId, flows: res.flows, apis: res.apis });
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Approve failed" });
    }
  };

  const handleBackToMarkdown = async () => {
    if (pipeline.step !== "extraction_review") return;
    const { docId } = pipeline;
    const doc = await api.getDocument(docId) as Document & { markdown_content?: string };
    setPipeline({ step: "markdown_review", docId, markdown: doc.markdown_content ?? "" });
  };

  const reset = () => {
    setPipeline({ step: "idle" });
    load();
  };

  const showUploadForm = pipeline.step === "idle" || pipeline.step === "done" || pipeline.step === "error";
  const showPipeline = pipeline.step !== "idle";
  const currentStepIdx = stepIndex(pipeline.step);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center">
          <FileText className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-gray-500 text-sm">Upload and manage API specification documents</p>
        </div>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <form onSubmit={handleUpload} className="mb-8 p-5 rounded-2xl border border-gray-800 bg-gray-900">
          <div className="text-sm font-medium text-gray-300 mb-4">Upload new document</div>
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">File</label>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.xlsx,.md,.pdf"
                className="text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-medium hover:file:bg-indigo-500 file:cursor-pointer"
              />
              <span className="text-xs text-gray-600">DOCX · XLSX · MD · PDF</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">Owner</label>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value as "Monee" | "Bank")}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="Monee">Monee (internal)</option>
                <option value="Bank">Bank (partner)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">Parser</label>
              <select
                value={parser}
                disabled
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              >
                <option value="markitdown">markitdown</option>
              </select>
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Upload
            </button>
          </div>
        </form>
      )}

      {/* Pipeline panel */}
      {showPipeline && (
        <div className="mb-8 border border-gray-700 rounded-2xl overflow-hidden bg-gray-900">
          {/* Step tabs */}
          {pipeline.step !== "done" && pipeline.step !== "error" && (
            <div className="flex border-b border-gray-800">
              {STEP_LABELS.map((label, i) => {
                const done = i < currentStepIdx;
                const active = i === currentStepIdx;
                return (
                  <div
                    key={label}
                    className={`flex-1 px-4 py-2.5 text-xs text-center font-medium border-r last:border-r-0 border-gray-800 ${
                      active ? "text-indigo-300 bg-indigo-950/50" : done ? "text-emerald-400" : "text-gray-600"
                    }`}
                  >
                    {done && <span className="mr-1">✓</span>}{label}
                  </div>
                );
              })}
            </div>
          )}

          <div className="p-5">
            {/* Uploading */}
            {pipeline.step === "uploading" && (
              <div className="flex items-center gap-3 text-sm text-indigo-300">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div>
                  <div className="font-medium">Converting document to Markdown…</div>
                  <div className="text-xs text-indigo-400/80 mt-0.5">Using {parser}. No AI yet — this is fast.</div>
                </div>
              </div>
            )}

            {/* Markdown review */}
            {pipeline.step === "markdown_review" && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">Review the parsed Markdown</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Check if the document was parsed correctly. Edit if needed, then proceed to AI extraction.
                    </p>
                  </div>
                  <button
                    onClick={handleExtract}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium shrink-0 transition-colors"
                  >
                    Proceed to AI Extraction <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  ref={markdownRef}
                  defaultValue={pipeline.markdown}
                  rows={20}
                  spellCheck={false}
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-xs font-mono text-gray-300 resize-y focus:outline-none focus:border-indigo-600 transition-colors"
                />
                <p className="text-xs text-gray-600">
                  Tip: Remove noise, fix table formatting, or correct section headings before extraction.
                </p>
              </div>
            )}

            {/* Extracting */}
            {pipeline.step === "extracting" && (
              <div className="flex items-center gap-3 text-sm text-indigo-300">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div>
                  <div className="font-medium">AI is analyzing the document…</div>
                  <div className="text-xs text-indigo-400/80 mt-0.5">
                    Extracting flows, APIs, fields, and error codes. This may take 20–60 s.
                  </div>
                </div>
              </div>
            )}

            {/* Extraction review */}
            {pipeline.step === "extraction_review" && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">Review extracted flows & APIs</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {pipeline.draft.flows.length} flow{pipeline.draft.flows.length !== 1 ? "s" : ""} extracted.
                      Verify the results, then approve to save.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={handleBackToMarkdown}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Edit Markdown
                    </button>
                    <button
                      onClick={handleApprove}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve & Save
                    </button>
                  </div>
                </div>
                {pipeline.draft.flows.length === 0 ? (
                  <div className="flex items-start gap-3 text-sm text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3">
                    <span className="text-base shrink-0">⚠️</span>
                    <div>
                      No flows were extracted. Try editing the markdown — ensure section headers, tables, and API paths are clearly visible.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pipeline.draft.flows.map((flow, i) => (
                      <FlowCard key={i} flow={flow} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Approving */}
            {pipeline.step === "approving" && (
              <div className="flex items-center gap-3 text-sm text-emerald-300">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div className="font-medium">Saving flows and APIs to database…</div>
              </div>
            )}

            {/* Done */}
            {pipeline.step === "done" && (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 text-sm text-emerald-300">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium mb-1">Saved successfully</div>
                    <div className="text-emerald-400/80 text-xs flex gap-4 flex-wrap">
                      <span>{pipeline.flows} flow{pipeline.flows !== 1 ? "s" : ""}</span>
                      <span>{pipeline.apis} APIs</span>
                      <Link
                        href={`/documents/${pipeline.docId}`}
                        className="underline hover:text-emerald-200 flex items-center gap-1"
                      >
                        View document <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors"
                >
                  Upload another
                </button>
              </div>
            )}

            {/* Error */}
            {pipeline.step === "error" && (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 text-sm text-red-300">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium mb-1">Error</div>
                    <div className="text-red-400/80 text-xs font-mono break-all">{pipeline.message}</div>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors shrink-0"
                >
                  Start over
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents yet. Upload one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="p-4 rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-700 transition-colors flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {doc.owner === "Monee" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
                      <User className="w-3 h-3" /> Monee
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
                      <Building2 className="w-3 h-3" /> Bank
                    </span>
                  )}
                  {doc.raw_format && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-mono uppercase">
                      {doc.raw_format}
                    </span>
                  )}
                  {doc.version && <span className="text-xs text-gray-600">v{doc.version}</span>}
                  {doc.pipeline_status && doc.pipeline_status !== "complete" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 border border-yellow-800/50 text-yellow-400">
                      {doc.pipeline_status === "markdown_ready" ? "awaiting extraction" : doc.pipeline_status}
                    </span>
                  )}
                </div>
                <div className="font-medium text-white truncate">{doc.name}</div>
                {doc.partner_name && <div className="text-xs text-gray-400 mt-0.5">Partner: {doc.partner_name}</div>}
                {doc.flow_name && <div className="text-xs text-gray-500 mt-0.5">Flow: {doc.flow_name}</div>}
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Link
                  href={`/documents/${doc.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 hover:bg-gray-800 transition-colors font-medium"
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </Link>
                <a
                  href={api.exportPostman(doc.id)}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800 transition-colors font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> Postman
                </a>
                <a
                  href={api.exportOpenApi(doc.id)}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-800 transition-colors font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> OpenAPI
                </a>
                <button
                  onClick={() => api.deleteDocument(doc.id).then(load)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-900/50 text-red-400 hover:bg-red-950/50 hover:border-red-700 transition-colors font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
