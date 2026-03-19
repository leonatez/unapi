"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { api, Document } from "@/lib/api/client";

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "done"; apis: number; flows: number; edge_cases: number; doc_id: string }
  | { status: "error"; message: string };

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<"Monee" | "Bank">("Monee");
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const data = await api.listDocuments();
    setDocs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("owner", owner);
    setUploadState({ status: "uploading" });
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/documents/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.detail || data?.message || `Server error ${res.status}`;
        setUploadState({ status: "error", message: msg });
        return;
      }
      if (data?._error || (!data?.document_id && !data?.apis)) {
        setUploadState({ status: "error", message: data?._error || "Parsing returned no results. Check the file format." });
        return;
      }
      setUploadState({
        status: "done",
        apis: data.apis ?? 0,
        flows: data.flows ?? 0,
        edge_cases: data.edge_cases ?? 0,
        doc_id: data.document_id,
      });
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error — is the backend running?";
      setUploadState({ status: "error", message });
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteDocument(id);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-white mb-6">Documents</h1>

      {/* Upload form */}
      <form onSubmit={handleUpload} className="mb-8 p-5 rounded-lg border border-gray-800 bg-gray-900">
        <div className="flex gap-4 flex-wrap items-end mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">File (DOCX / XLSX / MD / PDF)</label>
            <input ref={fileRef} type="file" accept=".docx,.xlsx,.md,.pdf"
              className="text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-indigo-700 file:text-white" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Owner</label>
            <select value={owner} onChange={(e) => setOwner(e.target.value as "Monee" | "Bank")}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
              <option value="Monee">Monee (internal)</option>
              <option value="Bank">Bank (partner)</option>
            </select>
          </div>
          <button type="submit" disabled={uploadState.status === "uploading"}
            className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50">
            {uploadState.status === "uploading" ? "Parsing…" : "Upload & Parse"}
          </button>
          {(uploadState.status === "done" || uploadState.status === "error") && (
            <button type="button" onClick={() => setUploadState({ status: "idle" })}
              className="px-3 py-2 rounded text-gray-500 hover:text-white text-sm">
              Clear
            </button>
          )}
        </div>

        {/* Status feedback */}
        {uploadState.status === "uploading" && (
          <div className="flex items-center gap-3 text-sm text-indigo-300 bg-indigo-950 border border-indigo-800 rounded px-4 py-3">
            <span className="animate-spin text-base">⏳</span>
            <div>
              <div className="font-medium">Parsing document…</div>
              <div className="text-indigo-400 text-xs mt-0.5">Converting → classifying sections → extracting APIs with LLM. Large files can take 30–90 s.</div>
            </div>
          </div>
        )}
        {uploadState.status === "done" && (
          <div className="flex items-start gap-3 text-sm text-emerald-300 bg-emerald-950 border border-emerald-800 rounded px-4 py-3">
            <span className="text-base">✓</span>
            <div>
              <div className="font-medium">Parsed successfully</div>
              <div className="text-emerald-400 text-xs mt-1 flex gap-4">
                <span>{uploadState.apis} APIs</span>
                <span>{uploadState.flows} flows</span>
                <span>{uploadState.edge_cases} edge cases</span>
                <Link href={`/documents/${uploadState.doc_id}`} className="underline hover:text-emerald-200">View document →</Link>
              </div>
            </div>
          </div>
        )}
        {uploadState.status === "error" && (
          <div className="flex items-start gap-3 text-sm text-red-300 bg-red-950 border border-red-800 rounded px-4 py-3">
            <span className="text-base">✗</span>
            <div>
              <div className="font-medium">Upload failed</div>
              <div className="text-red-400 text-xs mt-1 font-mono break-all">{uploadState.message}</div>
            </div>
          </div>
        )}
      </form>

      {/* Document list */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-gray-500">No documents yet. Upload one above.</p>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <div key={doc.id} className="p-4 rounded-lg border border-gray-800 bg-gray-900 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${doc.owner === "Monee" ? "bg-indigo-900 text-indigo-300" : "bg-amber-900 text-amber-300"}`}>
                    {doc.owner}
                  </span>
                  <span className="text-xs text-gray-500 uppercase">{doc.raw_format}</span>
                  {doc.version && <span className="text-xs text-gray-600">v{doc.version}</span>}
                </div>
                <div className="font-medium text-white truncate">{doc.name}</div>
                {doc.partner_name && <div className="text-xs text-gray-400">Partner: {doc.partner_name}</div>}
                {doc.flow_name && <div className="text-xs text-gray-500">Flow: {doc.flow_name}</div>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href={`/documents/${doc.id}`}
                  className="px-3 py-1.5 text-sm rounded border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500">
                  View
                </Link>
                <a href={api.exportPostman(doc.id)} target="_blank"
                  className="px-3 py-1.5 text-sm rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500">
                  Postman
                </a>
                <a href={api.exportOpenApi(doc.id)} target="_blank"
                  className="px-3 py-1.5 text-sm rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500">
                  OpenAPI
                </a>
                <button onClick={() => handleDelete(doc.id)}
                  className="px-3 py-1.5 text-sm rounded border border-red-900 text-red-400 hover:bg-red-950">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
