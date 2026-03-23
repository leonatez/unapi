"use client";
import React, { useEffect, useState } from "react";
import { ShieldAlert, AlertTriangle, Info } from "lucide-react";
import { api, Document, CompareResult, DiffItem } from "@/lib/api/client";

const SEV_STYLE: Record<string, string> = {
  breaking: "border-red-200 bg-red-50",
  risky:    "border-amber-200 bg-amber-50",
  info:     "border-stone-200 bg-stone-50",
};
const SEV_BADGE: Record<string, string> = {
  breaking: "bg-red-100 text-red-700",
  risky:    "bg-amber-100 text-amber-700",
  info:     "bg-stone-100 text-stone-600",
};
const SEV_ICON: Record<string, React.ReactNode> = {
  breaking: <ShieldAlert className="w-3 h-3" />,
  risky:    <AlertTriangle className="w-3 h-3" />,
  info:     <Info className="w-3 h-3" />,
};

export default function ComparePage() {
  const [docs, setDocs]     = useState<Document[]>([]);
  const [docA, setDocA]     = useState("");
  const [docB, setDocB]     = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState<"all" | "breaking" | "risky" | "info">("all");

  useEffect(() => { api.listDocuments().then(setDocs); }, []);

  const runCompare = async () => {
    if (!docA || !docB || docA === docB) return;
    setLoading(true);
    setResult(null);
    const r = await api.compare(docA, docB);
    setResult(r);
    setLoading(false);
  };

  const filtered    = result?.diffs.filter((d) => filter === "all" || d.severity === filter) || [];
  const mooneeDocs  = docs.filter((d) => d.owner === "Monee");
  const bankDocs    = docs.filter((d) => d.owner === "Bank");

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8 animate-fade-up">
        <h1 className="text-[22px] font-bold text-stone-900 mb-1 tracking-[-0.02em]">
          Compare Documents
        </h1>
        <p className="text-stone-500 text-sm">
          Internal (Monee) vs Partner (Bank) — select one from each side
        </p>
      </div>

      {/* Selectors card */}
      <div className="mb-6 p-5 rounded-2xl bg-white border border-[#E4E8E0] shadow-sm animate-fade-up" style={{ animationDelay: "60ms" }}>
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex flex-col gap-1.5 flex-1 min-w-52">
            <label className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">
              Internal Document (Monee)
            </label>
            <select
              value={docA}
              onChange={(e) => setDocA(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-[13px] text-stone-900 focus:outline-none focus:border-indigo-400 transition-colors"
            >
              <option value="">Select…</option>
              {mooneeDocs.map((d) => (
                <option key={d.id} value={d.id} className="bg-white text-stone-900">
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-52">
            <label className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">
              Partner Document (Bank)
            </label>
            <select
              value={docB}
              onChange={(e) => setDocB(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-[13px] text-stone-900 focus:outline-none focus:border-indigo-400 transition-colors"
            >
              <option value="">Select…</option>
              {bankDocs.map((d) => (
                <option key={d.id} value={d.id} className="bg-white text-stone-900">
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={runCompare}
              disabled={!docA || !docB || loading}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-[13px] transition-all duration-300 active:scale-[0.98] shadow-sm shadow-indigo-200"
            >
              {loading ? "Comparing…" : "Run Comparison"}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary filter pills */}
          <div className="flex gap-2 mb-5 flex-wrap animate-fade-up">
            {(["all", "breaking", "risky", "info"] as const).map((s) => {
              const count  = s === "all" ? result.summary.total : result.summary[s];
              const active = filter === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-[12px] font-medium transition-all duration-200 ${
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm"
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
                  }`}
                >
                  {s !== "all" && SEV_ICON[s]}
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  <span className={`text-[11px] font-semibold tabular-nums ${active ? "text-indigo-500" : "text-stone-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Diff list */}
          {filtered.length === 0 ? (
            <p className="text-stone-400 text-sm py-8 text-center">No diffs in this category.</p>
          ) : (
            <div className="space-y-2 stagger-children">
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
    <div className={`p-4 rounded-xl border ${SEV_STYLE[d.severity]} transition-all duration-200`}>
      <div className="flex items-start gap-3">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 flex items-center gap-1 ${SEV_BADGE[d.severity]}`}>
          {SEV_ICON[d.severity]}
          {d.severity}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {d.api_name && (
              <span className="text-[12px] text-indigo-600 font-semibold">{d.api_name}</span>
            )}
            <code className="text-[11px] text-stone-700 font-mono bg-stone-100 px-1.5 py-0.5 rounded">
              {d.field_path}
            </code>
            <span className="text-[11px] text-stone-400">· {d.aspect}</span>
          </div>
          <div className="flex gap-6 mt-2 text-[11px]">
            <div>
              <span className="text-stone-400">Internal: </span>
              <code className={`font-mono font-medium ${d.value_a ? "text-emerald-700" : "text-stone-300"}`}>
                {d.value_a ?? "—"}
              </code>
            </div>
            <div>
              <span className="text-stone-400">Partner: </span>
              <code className={`font-mono font-medium ${d.value_b ? "text-blue-600" : "text-stone-300"}`}>
                {d.value_b ?? "—"}
              </code>
            </div>
          </div>
          {d.notes && <div className="text-[11px] text-stone-400 mt-1">{d.notes}</div>}
        </div>
      </div>
    </div>
  );
}
