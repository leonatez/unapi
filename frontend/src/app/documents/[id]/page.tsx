"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, ChevronRight, GitBranch, AlertTriangle, ArrowRight } from "lucide-react";
import { api, Document, ApiDef, Flow, FlowApi } from "@/lib/api/client";
import ApiSpecPanel from "@/components/api-spec/ApiSpecPanel";
import VariablesPanel from "@/components/documents/VariablesPanel";
import { Tag } from "lucide-react";

const METHOD_STYLES: Record<string, string> = {
  GET:    "text-emerald-400 bg-emerald-500/10",
  POST:   "text-blue-400 bg-blue-500/10",
  PUT:    "text-yellow-400 bg-yellow-500/10",
  PATCH:  "text-orange-400 bg-orange-500/10",
  DELETE: "text-red-400 bg-red-500/10",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  markdown_ready:    { label: "Awaiting extraction", cls: "bg-yellow-900/40 border-yellow-800/50 text-yellow-400" },
  extracting:        { label: "Extracting…",         cls: "bg-indigo-900/40 border-indigo-800/50 text-indigo-300" },
  extraction_review: { label: "Awaiting approval",   cls: "bg-orange-900/40 border-orange-800/50 text-orange-400" },
  complete:          { label: "Complete",             cls: "bg-emerald-900/40 border-emerald-800/50 text-emerald-400" },
};

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Document | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selected, setSelected] = useState<ApiDef | null>(null);
  const [view, setView] = useState<"api" | "variables" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDocument(id), api.listFlows(id)]).then(([d, f]) => {
      setDoc(d);
      setFlows(f);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center text-gray-500">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <FileText className="w-8 h-8 opacity-30" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }
  if (!doc) return <div className="p-10 text-red-400">Document not found</div>;

  const loadFullApi = async (apiId: string) => {
    const full = await api.getApi(apiId);
    setSelected(full);
    setView("api");
  };

  const handleApiUpdated = (updated: ApiDef) => {
    setSelected(updated);
  };

  const totalApis = flows.reduce((sum, f) => sum + (f.api?.length ?? 0), 0);
  const statusInfo = STATUS_LABELS[doc.pipeline_status] ?? STATUS_LABELS.complete;
  const pipelineIncomplete = doc.pipeline_status !== "complete";

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <div className="w-72 border-r border-gray-800 bg-gray-900/50 overflow-y-auto flex-shrink-0">
        {/* Doc header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              doc.owner === "Monee"
                ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-300"
                : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
            }`}>
              {doc.owner}
            </span>
            {doc.raw_format && (
              <span className="text-xs text-gray-600 font-mono uppercase">{doc.raw_format}</span>
            )}
          </div>
          <div className="font-semibold text-white text-sm truncate">{doc.name}</div>
          {doc.version && <div className="text-xs text-gray-500 mt-0.5">v{doc.version}</div>}
          <div className={`mt-2 inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${statusInfo.cls}`}>
            {statusInfo.label}
          </div>
        </div>

        {/* Pipeline incomplete banner */}
        {pipelineIncomplete && (
          <div className="mx-2 mt-2 p-3 rounded-lg bg-yellow-950/30 border border-yellow-800/50">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-300">
                <div className="font-medium mb-1">Extraction not complete</div>
                <div className="text-yellow-400/80 mb-2">
                  {doc.pipeline_status === "markdown_ready" && "Markdown is ready. Go to Documents to run AI extraction."}
                  {doc.pipeline_status === "extracting" && "AI extraction is running…"}
                  {doc.pipeline_status === "extraction_review" && "Extraction ready for review. Go to Documents to approve."}
                </div>
                <button
                  onClick={() => router.push("/documents")}
                  className="inline-flex items-center gap-1 text-yellow-300 hover:text-yellow-100 font-medium"
                >
                  Go to Documents <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Variables Section */}
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={() => setView("variables")}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all ${
              view === "variables"
                ? "bg-indigo-950 border border-indigo-800 text-white"
                : "text-gray-300 hover:bg-gray-800 border border-transparent"
            }`}
          >
            <Tag className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-sm font-medium">Global Variables</span>
            {view === "variables" && <ChevronRight className="w-3 h-3 text-indigo-400 ml-auto shrink-0" />}
          </button>
        </div>

        {/* Flow + API list */}
        <div className="p-2 border-t border-gray-800">
          {flows.length === 0 ? (
            <p className="text-xs text-gray-600 px-2 py-3 italic">No flows yet.</p>
          ) : (
            flows.map((flow) => {
              const flowApis: FlowApi[] = flow.api ?? [];
              return (
                <div key={flow.id} className="mb-3">
                  {/* Flow header */}
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <GitBranch className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="text-xs font-medium text-indigo-300 truncate">{flow.name}</span>
                    <span className="ml-auto text-xs text-gray-700 shrink-0">{flowApis.length}</span>
                  </div>
                  {/* APIs under this flow */}
                  {flowApis.map((a) => {
                    const isSelected = view === "api" && selected?.id === a.id;
                    const methodStyle = a.method ? (METHOD_STYLES[a.method] ?? "text-gray-400 bg-gray-800") : "";
                    return (
                      <button
                        key={a.id}
                        onClick={() => loadFullApi(a.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-all ${
                          isSelected
                            ? "bg-indigo-950 border border-indigo-800"
                            : "hover:bg-gray-800 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {a.method && (
                            <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${methodStyle} shrink-0`}>
                              {a.method}
                            </span>
                          )}
                          <span className={`text-sm truncate ${isSelected ? "text-white" : "text-gray-300"}`}>
                            {a.name}
                          </span>
                          {isSelected && <ChevronRight className="w-3 h-3 text-indigo-400 ml-auto shrink-0" />}
                        </div>
                        {a.path && (
                          <div className="text-xs text-gray-600 mt-0.5 font-mono truncate pl-0.5">{a.path}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
          {flows.length > 0 && (
            <div className="text-xs text-gray-700 px-2 py-1 border-t border-gray-800 mt-2">
              {flows.length} flow{flows.length !== 1 ? "s" : ""} · {totalApis} API{totalApis !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto bg-white border-l border-gray-800">
        {view === "variables" ? (
          <VariablesPanel documentId={doc.id} />
        ) : view === "api" && selected ? (
          <ApiSpecPanel documentId={doc.id} api={selected} onApiUpdated={handleApiUpdated} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <FileText className="w-12 h-12 opacity-20" />
            <span className="text-sm font-medium">Select an API or Global Variables from the sidebar</span>
          </div>
        )}
      </div>
    </div>
  );
}
