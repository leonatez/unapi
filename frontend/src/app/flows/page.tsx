"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Flow } from "@/lib/api/client";

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listFlows().then((f) => { setFlows(f); setLoading(false); });
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-white mb-6">Integration Flows</h1>
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : flows.length === 0 ? (
        <p className="text-gray-500">No flows yet. Upload a document to generate flows.</p>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <Link key={f.id} href={`/flows/${f.id}`}
              className="block p-4 rounded-lg border border-gray-800 bg-gray-900 hover:border-gray-600 transition-colors">
              <div className="font-medium text-white">{f.name}</div>
              {f.description && <div className="text-sm text-gray-400 mt-1">{f.description}</div>}
              <div className="text-xs text-gray-500 mt-2">{f.flow_step?.length || 0} steps</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
