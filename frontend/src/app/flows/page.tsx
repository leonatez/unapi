"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, ChevronRight, Layers } from "lucide-react";
import { api, Flow } from "@/lib/api/client";

function SkeletonCard() {
  return (
    <div className="p-5 rounded-xl border border-gray-800 bg-gray-900 animate-pulse">
      <div className="h-5 w-48 bg-gray-800 rounded mb-2" />
      <div className="h-4 w-64 bg-gray-800 rounded mb-3" />
      <div className="h-4 w-16 bg-gray-800 rounded" />
    </div>
  );
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listFlows().then((f) => { setFlows(f); setLoading(false); });
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center">
          <GitBranch className="w-4.5 h-4.5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Integration Flows</h1>
          <p className="text-gray-500 text-sm">End-to-end API integration sequences</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : flows.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-2">No flows yet.</p>
          <p className="text-xs text-gray-700">Upload a document to generate flows.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <Link
              key={f.id}
              href={`/flows/${f.id}`}
              className="group block p-5 rounded-xl border border-gray-800 bg-gray-900 hover:border-indigo-800 hover:bg-gray-900/80 transition-all hover:shadow-lg hover:shadow-indigo-500/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white group-hover:text-indigo-300 transition-colors truncate mb-1">
                    {f.name}
                  </div>
                  {f.description && (
                    <div className="text-sm text-gray-400 line-clamp-2">{f.description}</div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <Layers className="w-3.5 h-3.5 text-gray-600" />
                <span className="text-xs text-gray-500">{f.flow_step?.length || 0} steps</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
