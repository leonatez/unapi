"use client";
import { useEffect, useState } from "react";
import { api, Document, CompareResult, DiffItem } from "@/lib/api/client";

const SEV_STYLE: Record<string, string> = {
  breaking: "border-red-800 bg-red-950/30",
  risky: "border-yellow-800 bg-yellow-950/20",
  info: "border-gray-800 bg-gray-900/50",
};
const SEV_BADGE: Record<string, string> = {
  breaking: "bg-red-900 text-red-300",
  risky: "bg-yellow-900 text-yellow-300",
  info: "bg-gray-800 text-gray-400",
};
const SEV_ICON: Record<string, string> = { breaking: "🚨", risky: "⚠️", info: "ℹ️" };

export default function ComparePage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [docA, setDocA] = useState("");
  const [docB, setDocB] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "breaking" | "risky" | "info">("all");

  useEffect(() => { api.listDocuments().then(setDocs); }, []);

  const runCompare = async () => {
    if (!docA || !docB || docA === docB) return;
    setLoading(true);
    setResult(null);
    const r = await api.compare(docA, docB);
    setResult(r);
    setLoading(false);
  };

  const filtered = result?.diffs.filter((d) => filter === "all" || d.severity === filter) || [];
  const mooneeDocs = docs.filter((d) => d.owner === "Monee");
  const bankDocs = docs.filter((d) => d.owner === "Bank");

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-white mb-2">Compare Documents</h1>
      <p className="text-gray-500 text-sm mb-8">Internal (Monee) vs Partner (Bank) — select one from each side</p>

      {/* Selectors */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex flex-col gap-1 flex-1 min-w-52">
          <label className="text-xs text-gray-400">Internal Document (Monee)</label>
          <select value={docA} onChange={(e) => setDocA(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white">
            <option value="">Select…</option>
            {mooneeDocs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-52">
          <label className="text-xs text-gray-400">Partner Document (Bank)</label>
          <select value={docB} onChange={(e) => setDocB(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white">
            <option value="">Select…</option>
            {bankDocs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={runCompare} disabled={!docA || !docB || loading}
            className="px-6 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-sm">
            {loading ? "Comparing…" : "Run Comparison"}
          </button>
        </div>
      </div>

      {/* Summary */}
      {result && (
        <>
          <div className="flex gap-4 mb-6 flex-wrap">
            {(["all", "breaking", "risky", "info"] as const).map((s) => {
              const count = s === "all" ? result.summary.total : result.summary[s];
              return (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    filter === s ? "border-indigo-500 text-white" : "border-gray-800 text-gray-400 hover:border-gray-600"
                  }`}>
                  {s === "all" ? "All" : SEV_ICON[s]} {s.charAt(0).toUpperCase() + s.slice(1)}{" "}
                  <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Diff list */}
          {filtered.length === 0 ? (
            <p className="text-gray-500">No diffs in this category.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((d, i) => <DiffCard key={i} diff={d} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DiffCard({ diff: d }: { diff: DiffItem }) {
  return (
    <div className={`p-4 rounded-lg border ${SEV_STYLE[d.severity]}`}>
      <div className="flex items-start gap-3">
        <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${SEV_BADGE[d.severity]}`}>
          {SEV_ICON[d.severity]} {d.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {d.api_name && <span className="text-xs text-indigo-400 font-medium">{d.api_name}</span>}
            <code className="text-xs text-gray-300 font-mono">{d.field_path}</code>
            <span className="text-xs text-gray-500">· {d.aspect}</span>
          </div>
          <div className="flex gap-6 mt-2 text-xs">
            <div>
              <span className="text-gray-500">Internal: </span>
              <code className={`font-mono ${d.value_a ? "text-green-400" : "text-gray-600"}`}>
                {d.value_a ?? "—"}
              </code>
            </div>
            <div>
              <span className="text-gray-500">Partner: </span>
              <code className={`font-mono ${d.value_b ? "text-blue-400" : "text-gray-600"}`}>
                {d.value_b ?? "—"}
              </code>
            </div>
          </div>
          {d.notes && <div className="text-xs text-gray-500 mt-1">{d.notes}</div>}
        </div>
      </div>
    </div>
  );
}
