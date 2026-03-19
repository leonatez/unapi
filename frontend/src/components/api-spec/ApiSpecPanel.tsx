"use client";
import { useEffect, useState } from "react";
import { ApiDef, ApiField, ApiError, EdgeCase, api } from "@/lib/api/client";

interface Props { api: ApiDef }

export default function ApiSpecPanel({ api: apiDef }: Props) {
  const [errors, setErrors] = useState<ApiError[]>([]);
  const [edgeCases, setEdgeCases] = useState<EdgeCase[]>([]);
  const [tab, setTab] = useState<"request" | "response" | "errors" | "edge">("request");

  useEffect(() => {
    api.getApiErrors(apiDef.id).then(setErrors);
    api.getApiEdgeCases(apiDef.id).then(setEdgeCases);
  }, [apiDef.id]);

  const request = apiDef.api_message?.find((m) => m.message_type === "request");
  const response = apiDef.api_message?.find((m) => m.message_type === "response");

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {apiDef.method && (
            <span className={`font-mono font-bold px-2 py-0.5 rounded text-sm ${
              apiDef.method === "GET" ? "bg-green-900 text-green-300" :
              apiDef.method === "POST" ? "bg-blue-900 text-blue-300" :
              apiDef.method === "PUT" ? "bg-yellow-900 text-yellow-300" : "bg-red-900 text-red-300"
            }`}>{apiDef.method}</span>
          )}
          <span className="font-mono text-gray-300 text-sm">{apiDef.path || "—"}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            apiDef.exposed_by === "Monee" ? "bg-indigo-900 text-indigo-300" : "bg-amber-900 text-amber-300"
          }`}>{apiDef.exposed_by} exposes</span>
          {apiDef.confidence_score < 0.8 && (
            <span className="text-xs px-2 py-0.5 rounded bg-orange-900 text-orange-300" title="Low parse confidence">
              ⚠ low confidence
            </span>
          )}
        </div>
        <h2 className="text-xl font-bold text-white">{apiDef.name}</h2>
        {apiDef.description && <p className="text-gray-400 text-sm mt-1">{apiDef.description}</p>}
        {apiDef.security_profile && (
          <div className="mt-3 p-3 rounded bg-gray-800 text-xs text-gray-400">
            <span className="text-gray-300 font-medium">Security: </span>
            {apiDef.security_profile.auth_type} ·{" "}
            {apiDef.security_profile.algorithm} ·{" "}
            Signature: [{apiDef.security_profile.signed_fields?.join(" + ")}]
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(["request", "response", "errors", "edge"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? "border-indigo-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}>
            {t === "edge" ? "Edge Cases" : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "errors" && errors.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-700 px-1.5 rounded">{errors.length}</span>
            )}
            {t === "edge" && edgeCases.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-700 px-1.5 rounded">{edgeCases.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "request" && (
        <FieldTable fields={request?.api_field || []} example={request?.example_json} />
      )}
      {tab === "response" && (
        <FieldTable fields={response?.api_field || []} example={response?.example_json} />
      )}
      {tab === "errors" && <ErrorTable errors={errors} />}
      {tab === "edge" && <EdgeCaseTable cases={edgeCases} />}
    </div>
  );
}

function FieldTable({ fields, example }: { fields: ApiField[]; example?: string | null }) {
  const roots = fields.filter((f) => !f.parent_field_id);
  if (roots.length === 0) return <p className="text-gray-500 text-sm">No fields extracted.</p>;
  return (
    <div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
            <th className="pb-2 pr-4 font-medium">Field</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 pr-4 font-medium">Req</th>
            <th className="pb-2 pr-4 font-medium">Max</th>
            <th className="pb-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {roots.map((f) => <FieldRow key={f.id} field={f} depth={0} allFields={fields} />)}
        </tbody>
      </table>
      {example && (
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-1">Example</div>
          <pre className="p-3 rounded bg-gray-800 text-xs text-gray-300 overflow-x-auto">{example}</pre>
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, depth, allFields }: { field: ApiField; depth: number; allFields: ApiField[] }) {
  const children = allFields.filter((f) => f.parent_field_id === field.id);
  return (
    <>
      <tr className="border-b border-gray-900 hover:bg-gray-900/50">
        <td className="py-2 pr-4 font-mono text-xs" style={{ paddingLeft: `${depth * 16 + 4}px` }}>
          <div className="flex items-center gap-1">
            {field.is_deprecated && <span className="text-gray-600 line-through">{field.name}</span>}
            {!field.is_deprecated && <span className="text-gray-200">{field.name}</span>}
            {field.is_encrypted && <span title="Encrypted" className="text-yellow-500">🔒</span>}
            {field.is_deprecated && <span title="Deprecated" className="text-xs text-gray-600">[dep]</span>}
            {field.confidence_score < 0.7 && <span title="Low confidence" className="text-orange-500 text-xs">?</span>}
          </div>
          {field.api_field_enum && field.api_field_enum.length > 0 && (
            <div className="text-gray-600 text-xs mt-0.5">[{field.api_field_enum.map((e) => e.value).join(", ")}]</div>
          )}
        </td>
        <td className="py-2 pr-4 text-xs text-blue-400">{field.data_type || "—"}</td>
        <td className="py-2 pr-4">
          <span className={`text-xs font-medium ${field.is_required ? "text-red-400" : "text-gray-600"}`}>
            {field.is_required ? "M" : "O"}
          </span>
        </td>
        <td className="py-2 pr-4 text-xs text-gray-500">{field.max_length || "—"}</td>
        <td className="py-2 text-xs text-gray-400">
          {field.description}
          {field.default_value && <span className="text-gray-600"> [default: {field.default_value}]</span>}
          {field.constraints && <div className="text-gray-600 italic">{field.constraints}</div>}
        </td>
      </tr>
      {children.map((c) => <FieldRow key={c.id} field={c} depth={depth + 1} allFields={allFields} />)}
    </>
  );
}

function ErrorTable({ errors }: { errors: ApiError[] }) {
  if (errors.length === 0) return <p className="text-gray-500 text-sm">No errors extracted.</p>;
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
          <th className="pb-2 pr-4 font-medium">HTTP</th>
          <th className="pb-2 pr-4 font-medium">resultStatus</th>
          <th className="pb-2 pr-4 font-medium">resultCode</th>
          <th className="pb-2 font-medium">Message</th>
        </tr>
      </thead>
      <tbody>
        {errors.map((e) => (
          <tr key={e.id} className="border-b border-gray-900 hover:bg-gray-900/50">
            <td className="py-2 pr-4 text-xs font-mono">{e.http_status || "—"}</td>
            <td className="py-2 pr-4 text-xs font-mono text-purple-400">{e.result_status || "—"}</td>
            <td className="py-2 pr-4 text-xs font-mono text-yellow-400">{e.result_code || "—"}</td>
            <td className="py-2 text-xs text-gray-400">{e.result_message || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EdgeCaseTable({ cases }: { cases: EdgeCase[] }) {
  if (cases.length === 0) return <p className="text-gray-500 text-sm">No edge cases extracted.</p>;
  const actionColor: Record<string, string> = {
    retry: "text-blue-400",
    inquiry: "text-yellow-400",
    next_step: "text-green-400",
    fail: "text-red-400",
    end_flow: "text-gray-400",
  };
  return (
    <div className="space-y-3">
      {cases.map((ec) => (
        <div key={ec.id} className="p-3 rounded border border-gray-800 bg-gray-900">
          <div className={`font-medium text-sm ${actionColor[ec.action] || "text-white"}`}>
            {ec.action.toUpperCase()}
            {ec.retry_max && <span className="text-gray-500 text-xs font-normal ml-2">max {ec.retry_max} retries</span>}
          </div>
          {ec.condition && <div className="text-xs text-gray-400 mt-1">When: {ec.condition}</div>}
          {ec.notes && <div className="text-xs text-gray-500 mt-1">{ec.notes}</div>}
        </div>
      ))}
    </div>
  );
}
