"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Lock, AlertTriangle, Pencil, X, Upload, Loader2 } from "lucide-react";
import { ApiDef, ApiField, ApiError, EdgeCase, api } from "@/lib/api/client";

interface Props {
  api: ApiDef;
  onApiUpdated?: (updated: ApiDef) => void;
}

// ─── Tiny reusable primitives ──────────────────────────────────

function Inp({ value, onChange, className = "", placeholder = "" }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-white border border-stone-300 rounded px-2 py-1 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-indigo-400 ${className}`}
    />
  );
}

function Sel({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white border border-stone-300 rounded px-2 py-1 text-sm text-stone-800 focus:outline-none focus:border-indigo-400"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function SaveCancel({ onSave, onCancel, saving }: {
  onSave: () => void; onCancel: () => void; saving?: boolean;
}) {
  return (
    <span className="flex gap-1">
      <button onClick={onSave} disabled={saving}
        className="px-2 py-0.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
        {saving ? "…" : "Save"}
      </button>
      <button onClick={onCancel}
        className="px-2 py-0.5 text-xs rounded bg-stone-100 hover:bg-stone-200 text-stone-700">
        Cancel
      </button>
    </span>
  );
}

// ─── Main panel ────────────────────────────────────────────────

export default function ApiSpecPanel({ api: apiDef, onApiUpdated }: Props) {
  const [localApi, setLocalApi] = useState<ApiDef>(apiDef);
  const [errors, setErrors] = useState<ApiError[]>([]);
  const [edgeCases, setEdgeCases] = useState<EdgeCase[]>([]);
  const [tab, setTab] = useState<"request" | "response" | "errors" | "edge">("request");
  const [editingHeader, setEditingHeader] = useState(false);
  const [showReextract, setShowReextract] = useState(false);

  useEffect(() => {
    setLocalApi(apiDef);
    setEditingHeader(false);
  }, [apiDef.id]);

  useEffect(() => {
    api.getApiErrors(apiDef.id).then(setErrors);
    api.getApiEdgeCases(apiDef.id).then(setEdgeCases);
  }, [apiDef.id]);

  const refreshFields = useCallback(async () => {
    const fresh = await api.getApi(localApi.id);
    setLocalApi(fresh);
    if (onApiUpdated) onApiUpdated(fresh);
  }, [localApi.id, onApiUpdated]);

  const request = localApi.api_message?.find((m) => m.message_type === "request");
  const response = localApi.api_message?.find((m) => m.message_type === "response");

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      {editingHeader ? (
        <ApiHeaderEdit
          apiDef={localApi}
          onSaved={(updated) => { setLocalApi(updated); setEditingHeader(false); if (onApiUpdated) onApiUpdated(updated); }}
          onCancel={() => setEditingHeader(false)}
        />
      ) : (
        <div className="mb-6 group">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                {localApi.method && (
                  <span className={`font-mono font-bold px-2 py-0.5 rounded text-sm ${
                    localApi.method === "GET" ? "bg-green-100 text-green-700" :
                    localApi.method === "POST" ? "bg-blue-100 text-blue-700" :
                    localApi.method === "PUT" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  }`}>{localApi.method}</span>
                )}
                <span className="font-mono text-stone-600 text-sm">{localApi.path || "—"}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  localApi.exposed_by === "Monee" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"
                }`}>{localApi.exposed_by} exposes</span>
                {localApi.confidence_score < 0.8 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />low confidence
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-[#1A1A1A]">{localApi.name}</h2>
              {localApi.description && <p className="text-stone-500 text-sm mt-1">{localApi.description}</p>}
              {localApi.security_profile && (
                <div className="mt-3 p-3 rounded bg-stone-100 text-xs text-stone-500">
                  <span className="text-stone-700 font-medium">Security: </span>
                  {localApi.security_profile.auth_type} · {localApi.security_profile.algorithm} ·{" "}
                  Signature: [{localApi.security_profile.signed_fields?.join(" + ")}]
                </div>
              )}
            </div>
            <div className="ml-4 flex gap-2 shrink-0">
              <button
                onClick={() => setShowReextract(true)}
                className="px-3 py-1.5 text-xs rounded border border-indigo-300 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 flex items-center gap-1.5 transition-colors">
                <Upload className="w-3 h-3" />
                Re-extract
              </button>
              <button
                onClick={() => setEditingHeader(true)}
                className="px-3 py-1.5 text-xs rounded border border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                Edit API
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-stone-200">
        {(["request", "response", "errors", "edge"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? "border-indigo-500 text-[#1A1A1A]" : "border-transparent text-stone-400 hover:text-stone-600"
            }`}>
            {t === "edge" ? "Edge Cases" : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "errors" && errors.length > 0 && (
              <span className="ml-1.5 text-xs bg-stone-200 text-stone-600 px-1.5 rounded">{errors.length}</span>
            )}
            {t === "edge" && edgeCases.length > 0 && (
              <span className="ml-1.5 text-xs bg-stone-200 text-stone-600 px-1.5 rounded">{edgeCases.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "request" && (
        <FieldTable
          apiId={localApi.id}
          messageType="request"
          fields={request?.api_field || []}
          example={request?.example_json}
          onChanged={refreshFields}
        />
      )}
      {tab === "response" && (
        <FieldTable
          apiId={localApi.id}
          messageType="response"
          fields={response?.api_field || []}
          example={response?.example_json}
          onChanged={refreshFields}
        />
      )}
      {tab === "errors" && (
        <ErrorTable
          apiId={localApi.id}
          errors={errors}
          onChange={setErrors}
        />
      )}
      {tab === "edge" && <EdgeCaseTable cases={edgeCases} />}

      {/* Re-extract modal */}
      {showReextract && (
        <ReextractModal
          apiId={localApi.id}
          apiName={localApi.name}
          onClose={() => setShowReextract(false)}
          onDone={async () => {
            setShowReextract(false);
            const fresh = await api.getApi(localApi.id);
            setLocalApi(fresh);
            const [errs, ecs] = await Promise.all([
              api.getApiErrors(localApi.id),
              api.getApiEdgeCases(localApi.id),
            ]);
            setErrors(errs);
            setEdgeCases(ecs);
            if (onApiUpdated) onApiUpdated(fresh);
          }}
        />
      )}
    </div>
  );
}

// ─── Re-extract modal ─────────────────────────────────────────

function ReextractModal({ apiId, apiName, onClose, onDone }: {
  apiId: string;
  apiName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!files.length) return;
    setLoading(true);
    setError(null);
    try {
      await api.reextractApi(apiId, files);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white border border-stone-200 rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#1A1A1A] font-semibold">Re-extract with AI</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-stone-500 text-sm mb-4">
          Upload screenshots or a markdown file for <span className="text-[#1A1A1A] font-medium">{apiName}</span>.
          AI will replace the request/response fields, errors, and edge cases.
        </p>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-stone-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}>
          <Upload className="w-6 h-6 text-stone-400 mx-auto mb-2" />
          <p className="text-sm text-stone-500">Click or drag files here</p>
          <p className="text-xs text-stone-400 mt-1">PNG · JPG · WEBP · MD · TXT</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,.md,.txt,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <ul className="mt-3 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-sm text-stone-700 bg-stone-100 rounded px-3 py-1.5">
                <span className="truncate">{f.name}</span>
                <button onClick={() => removeFile(i)} className="ml-2 text-stone-400 hover:text-red-500 shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded border border-stone-300 text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!files.length || loading}
            className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loading ? "Extracting…" : "Extract"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── API Header Edit form ──────────────────────────────────────

function ApiHeaderEdit({ apiDef, onSaved, onCancel }: {
  apiDef: ApiDef;
  onSaved: (updated: ApiDef) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: apiDef.name ?? "",
    description: apiDef.description ?? "",
    method: apiDef.method ?? "",
    path: apiDef.path ?? "",
    exposed_by: apiDef.exposed_by ?? "Monee",
    is_idempotent: apiDef.is_idempotent ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      const updated = await api.updateApi(apiDef.id, {
        name: form.name || undefined,
        description: form.description || undefined,
        method: form.method || undefined,
        path: form.path || undefined,
        exposed_by: form.exposed_by as "Monee" | "Bank",
        is_idempotent: form.is_idempotent,
      });
      onSaved(updated as ApiDef);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mb-6 p-4 rounded-xl border border-indigo-300 bg-indigo-50/50">
      <div className="text-xs text-indigo-600 uppercase tracking-wide mb-3">Editing API</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-xs text-stone-500 block mb-1">Name</label>
          <Inp value={form.name} onChange={set("name")} className="w-full" />
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">Method</label>
          <Sel value={form.method} onChange={set("method")} options={["", "GET", "POST", "PUT", "PATCH", "DELETE"]} />
        </div>
        <div>
          <label className="text-xs text-stone-500 block mb-1">Exposed by</label>
          <Sel value={form.exposed_by} onChange={set("exposed_by")} options={["Monee", "Bank"]} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-stone-500 block mb-1">Path</label>
          <Inp value={form.path} onChange={set("path")} className="w-full" placeholder="/api/v1/..." />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-stone-500 block mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set("description")(e.target.value)}
            rows={2}
            className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-sm text-stone-800 focus:outline-none focus:border-indigo-400 resize-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="idempotent" checked={form.is_idempotent}
            onChange={(e) => set("is_idempotent")(e.target.checked)} className="accent-indigo-500" />
          <label htmlFor="idempotent" className="text-xs text-stone-500">Idempotent</label>
        </div>
      </div>
      {err && <p className="text-red-500 text-xs mb-2">{err}</p>}
      <div className="flex gap-2">
        <SaveCancel onSave={save} onCancel={onCancel} saving={saving} />
      </div>
    </div>
  );
}

// ─── Field Table ───────────────────────────────────────────────

function FieldTable({ apiId, messageType, fields, example, onChanged }: {
  apiId: string;
  messageType: "request" | "response";
  fields: ApiField[];
  example?: string | null;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const roots = fields.filter((f) => !f.parent_field_id);

  return (
    <div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-stone-400 border-b border-stone-200">
            <th className="pb-2 pr-3 font-medium w-40">Field</th>
            <th className="pb-2 pr-3 font-medium w-24">Type</th>
            <th className="pb-2 pr-3 font-medium w-12">Req</th>
            <th className="pb-2 pr-3 font-medium w-16">Max</th>
            <th className="pb-2 pr-3 font-medium">Description</th>
            <th className="pb-2 font-medium w-48">Value / Logic</th>
            <th className="pb-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {roots.map((f) => (
            <FieldRow key={f.id} field={f} depth={0} allFields={fields} apiId={apiId} onChanged={onChanged} />
          ))}
          {adding && (
            <AddFieldRow
              apiId={apiId}
              messageType={messageType}
              onSaved={() => { setAdding(false); onChanged(); }}
              onCancel={() => setAdding(false)}
            />
          )}
        </tbody>
      </table>

      {!adding && (
        <button onClick={() => setAdding(true)}
          className="mt-3 text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
          + Add field
        </button>
      )}

      {example && (
        <div className="mt-4">
          <div className="text-xs text-stone-400 mb-1">Example</div>
          <pre className="p-3 rounded-lg bg-stone-100 text-xs text-stone-600 overflow-x-auto">{example}</pre>
        </div>
      )}

      {roots.length === 0 && !adding && (
        <p className="text-stone-400 text-xs mt-2">No fields extracted. Use + Add field to add manually.</p>
      )}
    </div>
  );
}

function FieldRow({ field, depth, allFields, apiId, onChanged }: {
  field: ApiField; depth: number; allFields: ApiField[]; apiId: string; onChanged: () => void;
}) {
  const children = allFields.filter((f) => f.parent_field_id === field.id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: field.name ?? "",
    description: field.description ?? "",
    data_type: field.data_type ?? "",
    max_length: field.max_length ? String(field.max_length) : "",
    is_required: field.is_required,
    default_value: field.default_value ?? "",
    constraints: field.constraints ?? "",
    value_logic: field.value_logic ?? "",
    is_encrypted: field.is_encrypted,
    is_deprecated: field.is_deprecated,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateField(apiId, field.id, {
        name: form.name || undefined,
        description: form.description || undefined,
        data_type: form.data_type || undefined,
        max_length: form.max_length ? parseInt(form.max_length) : undefined,
        is_required: form.is_required,
        default_value: form.default_value || undefined,
        constraints: form.constraints || undefined,
        value_logic: form.value_logic || undefined,
        is_encrypted: form.is_encrypted,
        is_deprecated: form.is_deprecated,
      });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm(`Delete field "${field.name}"?`)) return;
    await api.deleteField(apiId, field.id);
    onChanged();
  };

  const set = (k: string) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  if (editing) {
    return (
      <>
        <tr className="bg-indigo-50/50 border-b border-indigo-200">
          <td colSpan={7} className="py-2 px-3" style={{ paddingLeft: `${depth * 16 + 12}px` }}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-stone-500">Name</label>
                <Inp value={form.name} onChange={set("name")} className="w-full mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-stone-500">Type</label>
                <Sel value={form.data_type} onChange={set("data_type")}
                  options={["", "String", "Number", "Boolean", "Object", "Array", "Date"]} />
              </div>
              <div>
                <label className="text-xs text-stone-500">Max length</label>
                <Inp value={form.max_length} onChange={set("max_length")} className="w-full mt-0.5" placeholder="—" />
              </div>
              <div>
                <label className="text-xs text-stone-500">Default</label>
                <Inp value={form.default_value} onChange={set("default_value")} className="w-full mt-0.5" placeholder="—" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-stone-500">Description</label>
                <Inp value={form.description} onChange={set("description")} className="w-full mt-0.5" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-stone-500">Constraints</label>
                <Inp value={form.constraints} onChange={set("constraints")} className="w-full mt-0.5" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-stone-500">Value / Logic</label>
                <Inp value={form.value_logic} onChange={set("value_logic")} className="w-full mt-0.5" placeholder="e.g. VCB001, Fixed: PAYMENT, If A then X; if B then Y" />
              </div>
              <div className="col-span-2 flex gap-4 text-xs text-stone-500 items-center flex-wrap">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.is_required} onChange={(e) => set("is_required")(e.target.checked)} className="accent-red-500" />
                  Required
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.is_encrypted} onChange={(e) => set("is_encrypted")(e.target.checked)} className="accent-yellow-500" />
                  Encrypted
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={form.is_deprecated} onChange={(e) => set("is_deprecated")(e.target.checked)} className="accent-stone-400" />
                  Deprecated
                </label>
              </div>
              <div className="col-span-2">
                <SaveCancel onSave={save} onCancel={() => setEditing(false)} saving={saving} />
              </div>
            </div>
          </td>
        </tr>
        {children.map((c) => (
          <FieldRow key={c.id} field={c} depth={depth + 1} allFields={allFields} apiId={apiId} onChanged={onChanged} />
        ))}
      </>
    );
  }

  return (
    <>
      <tr className="border-b border-stone-100 hover:bg-stone-50 group">
        <td className="py-2 pr-3 font-mono text-xs" style={{ paddingLeft: `${depth * 16 + 4}px` }}>
          <div className="flex items-center gap-1">
            {field.is_deprecated
              ? <span className="text-stone-400 line-through">{field.name}</span>
              : <span className="text-stone-800">{field.name}</span>}
            {field.is_encrypted && <Lock className="w-3 h-3 text-amber-500 shrink-0" title="Encrypted" />}
            {field.is_deprecated && <span className="text-xs text-stone-400">[dep]</span>}
            {field.confidence_score < 0.7 && <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" title="Low confidence" />}
          </div>
          {field.api_field_enum && field.api_field_enum.length > 0 && (
            <div className="text-stone-400 text-xs mt-0.5">[{field.api_field_enum.map((e) => e.value).join(", ")}]</div>
          )}
        </td>
        <td className="py-2 pr-3 text-xs text-blue-600">{field.data_type || "—"}</td>
        <td className="py-2 pr-3">
          <span className={`text-xs font-medium ${field.is_required ? "text-red-600" : "text-stone-400"}`}>
            {field.is_required ? "M" : "O"}
          </span>
        </td>
        <td className="py-2 pr-3 text-xs text-stone-400">{field.max_length || "—"}</td>
        <td className="py-2 pr-3 text-xs text-stone-500">
          {field.description}
          {field.default_value && <span className="text-stone-400"> [default: {field.default_value}]</span>}
          {field.constraints && <div className="text-stone-400 italic">{field.constraints}</div>}
        </td>
        <td className="py-2 text-xs text-stone-500">
          {field.value_logic || <span className="text-stone-300">—</span>}
        </td>
        <td className="py-2 text-right pr-1">
          <span className="hidden group-hover:inline-flex gap-1">
            <button onClick={() => setEditing(true)} title="Edit"
              className="text-stone-400 hover:text-stone-700 p-1"><Pencil className="w-3 h-3" /></button>
            <button onClick={del} title="Delete"
              className="text-stone-400 hover:text-red-500 p-1"><X className="w-3 h-3" /></button>
          </span>
        </td>
      </tr>
      {children.map((c) => (
        <FieldRow key={c.id} field={c} depth={depth + 1} allFields={allFields} apiId={apiId} onChanged={onChanged} />
      ))}
    </>
  );
}

function AddFieldRow({ apiId, messageType, onSaved, onCancel }: {
  apiId: string; messageType: "request" | "response"; onSaved: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({ name: "", data_type: "", is_required: false, description: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await api.createField(apiId, {
        message_type: messageType,
        name: form.name,
        data_type: form.data_type || undefined,
        is_required: form.is_required,
        description: form.description || undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <tr className="bg-indigo-50/50 border-b border-indigo-200">
      <td colSpan={7} className="py-2 px-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Inp value={form.name} onChange={set("name")} placeholder="field name *" className="w-32" />
          <Sel value={form.data_type} onChange={set("data_type")}
            options={["", "String", "Number", "Boolean", "Object", "Array", "Date"]} />
          <Inp value={form.description} onChange={set("description")} placeholder="description" className="flex-1 min-w-32" />
          <label className="flex items-center gap-1 text-xs text-stone-500 cursor-pointer">
            <input type="checkbox" checked={form.is_required}
              onChange={(e) => set("is_required")(e.target.checked)} className="accent-red-500" />
            Required
          </label>
          <SaveCancel onSave={save} onCancel={onCancel} saving={saving} />
        </div>
      </td>
    </tr>
  );
}

// ─── Error Table ───────────────────────────────────────────────

function ErrorTable({ apiId, errors, onChange }: {
  apiId: string; errors: ApiError[]; onChange: (e: ApiError[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this error row?")) return;
    await api.deleteError(apiId, id);
    onChange(errors.filter((e) => e.id !== id));
  };

  const handleUpdate = (updated: ApiError) => {
    onChange(errors.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleCreate = (created: ApiError) => {
    onChange([...errors, created]);
    setAdding(false);
  };

  return (
    <div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-stone-400 border-b border-stone-200">
            <th className="pb-2 pr-3 font-medium w-16">HTTP</th>
            <th className="pb-2 pr-3 font-medium w-36">resultStatus</th>
            <th className="pb-2 pr-3 font-medium w-24">resultCode</th>
            <th className="pb-2 font-medium">Message</th>
            <th className="pb-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e) => (
            <ErrorRow key={e.id} error={e} apiId={apiId} onUpdated={handleUpdate} onDeleted={() => handleDelete(e.id)} />
          ))}
          {adding && (
            <AddErrorRow apiId={apiId} onCreated={handleCreate} onCancel={() => setAdding(false)} />
          )}
        </tbody>
      </table>
      {!adding && (
        <button onClick={() => setAdding(true)}
          className="mt-3 text-xs text-indigo-500 hover:text-indigo-600">
          + Add error
        </button>
      )}
      {errors.length === 0 && !adding && (
        <p className="text-stone-400 text-xs mt-2">No errors extracted.</p>
      )}
    </div>
  );
}

function ErrorRow({ error, apiId, onUpdated, onDeleted }: {
  error: ApiError; apiId: string; onUpdated: (e: ApiError) => void; onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    http_status: String(error.http_status ?? ""),
    result_status: error.result_status ?? "",
    result_code: error.result_code ?? "",
    result_message: error.result_message ?? "",
    condition: error.condition ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateError(apiId, error.id, {
        http_status: form.http_status ? parseInt(form.http_status) : undefined,
        result_status: form.result_status || undefined,
        result_code: form.result_code || undefined,
        result_message: form.result_message || undefined,
        condition: form.condition || undefined,
      });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (editing) {
    return (
      <tr className="bg-indigo-50/50 border-b border-indigo-200">
        <td colSpan={5} className="py-2 px-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Inp value={form.http_status} onChange={set("http_status")} placeholder="200" className="w-16" />
            <Inp value={form.result_status} onChange={set("result_status")} placeholder="SENTOTP-SUCCESS" className="w-40" />
            <Inp value={form.result_code} onChange={set("result_code")} placeholder="2007" className="w-24" />
            <Inp value={form.result_message} onChange={set("result_message")} placeholder="message" className="flex-1 min-w-32" />
            <Inp value={form.condition} onChange={set("condition")} placeholder="condition (optional)" className="w-40" />
            <SaveCancel onSave={save} onCancel={() => setEditing(false)} saving={saving} />
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50 group">
      <td className="py-2 pr-3 text-xs font-mono text-stone-600">{error.http_status || "—"}</td>
      <td className="py-2 pr-3 text-xs font-mono text-purple-600">{error.result_status || "—"}</td>
      <td className="py-2 pr-3 text-xs font-mono text-amber-600">{error.result_code || "—"}</td>
      <td className="py-2 text-xs text-stone-500">{error.result_message || "—"}</td>
      <td className="py-2 text-right pr-1">
        <span className="hidden group-hover:inline-flex gap-1">
          <button onClick={() => setEditing(true)} className="text-stone-400 hover:text-stone-700 p-1"><Pencil className="w-3 h-3" /></button>
          <button onClick={onDeleted} className="text-stone-400 hover:text-red-500 p-1"><X className="w-3 h-3" /></button>
        </span>
      </td>
    </tr>
  );
}

function AddErrorRow({ apiId, onCreated, onCancel }: {
  apiId: string; onCreated: (e: ApiError) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({ http_status: "", result_status: "", result_code: "", result_message: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const created = await api.createError(apiId, {
        http_status: form.http_status ? parseInt(form.http_status) : undefined,
        result_status: form.result_status || undefined,
        result_code: form.result_code || undefined,
        result_message: form.result_message || undefined,
      });
      onCreated(created);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <tr className="bg-indigo-50/50 border-b border-indigo-200">
      <td colSpan={5} className="py-2 px-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Inp value={form.http_status} onChange={set("http_status")} placeholder="HTTP (e.g. 200)" className="w-20" />
          <Inp value={form.result_status} onChange={set("result_status")} placeholder="resultStatus" className="w-40" />
          <Inp value={form.result_code} onChange={set("result_code")} placeholder="resultCode" className="w-24" />
          <Inp value={form.result_message} onChange={set("result_message")} placeholder="resultMessage" className="flex-1 min-w-32" />
          <SaveCancel onSave={save} onCancel={onCancel} saving={saving} />
        </div>
      </td>
    </tr>
  );
}

// ─── Edge Cases (read-only for now) ───────────────────────────

function EdgeCaseTable({ cases }: { cases: EdgeCase[] }) {
  if (cases.length === 0) return <p className="text-stone-400 text-sm">No edge cases extracted.</p>;
  const actionColor: Record<string, string> = {
    retry: "text-blue-600", inquiry: "text-amber-600",
    next_step: "text-green-600", fail: "text-red-600", end_flow: "text-stone-500",
  };
  return (
    <div className="space-y-3">
      {cases.map((ec) => (
        <div key={ec.id} className="p-3 rounded-xl border border-stone-200 bg-white">
          <div className={`font-medium text-sm ${actionColor[ec.action] || "text-stone-800"}`}>
            {ec.action.toUpperCase()}
            {ec.retry_max && <span className="text-stone-400 text-xs font-normal ml-2">max {ec.retry_max} retries</span>}
          </div>
          {ec.condition && <div className="text-xs text-stone-500 mt-1">When: {ec.condition}</div>}
          {ec.notes && <div className="text-xs text-stone-400 mt-1">{ec.notes}</div>}
        </div>
      ))}
    </div>
  );
}
