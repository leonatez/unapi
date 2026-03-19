"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, Document, ApiDef } from "@/lib/api/client";
import ApiSpecPanel from "@/components/api-spec/ApiSpecPanel";

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [apis, setApis] = useState<ApiDef[]>([]);
  const [selected, setSelected] = useState<ApiDef | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDocument(id), api.listApis(id)]).then(([d, a]) => {
      setDoc(d);
      setApis(a);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-10 text-gray-500">Loading…</div>;
  if (!doc) return <div className="p-10 text-red-400">Document not found</div>;

  const loadFullApi = async (a: ApiDef) => {
    const full = await api.getApi(a.id);
    setSelected(full);
  };

  return (
    <div className="flex h-[calc(100vh-53px)]">
      {/* Sidebar: API list */}
      <div className="w-72 border-r border-gray-800 bg-gray-900 overflow-y-auto flex-shrink-0">
        <div className="p-4 border-b border-gray-800">
          <div className="text-xs text-gray-500 mb-1">
            <span className={`px-2 py-0.5 rounded ${doc.owner === "Monee" ? "bg-indigo-900 text-indigo-300" : "bg-amber-900 text-amber-300"}`}>
              {doc.owner}
            </span>
          </div>
          <div className="font-semibold text-white text-sm truncate">{doc.name}</div>
          {doc.version && <div className="text-xs text-gray-500">v{doc.version}</div>}
        </div>
        <div className="p-2">
          <div className="text-xs text-gray-500 px-2 py-1 uppercase tracking-wide">APIs ({apis.length})</div>
          {apis.map((a) => (
            <button
              key={a.id}
              onClick={() => loadFullApi(a)}
              className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                selected?.id === a.id ? "bg-indigo-900 text-white" : "hover:bg-gray-800 text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {a.method && (
                  <span className={`text-xs font-mono font-bold ${
                    a.method === "GET" ? "text-green-400" :
                    a.method === "POST" ? "text-blue-400" :
                    a.method === "PUT" ? "text-yellow-400" : "text-red-400"
                  }`}>{a.method}</span>
                )}
                <span className="truncate">{a.name}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {a.exposed_by === "Monee" ? "↑ we expose" : "↓ bank exposes"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main: API spec panel */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <ApiSpecPanel api={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600">
            Select an API from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}
