"use client";
import { useEffect, useState } from "react";
import { Plus, X, Pencil, Loader2, Save, Trash2, Tag } from "lucide-react";
import { api, DocumentVariable } from "@/lib/api/client";

export default function VariablesPanel({ documentId }: { documentId: string }) {
  const [variables, setVariables] = useState<DocumentVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadVariables();
  }, [documentId]);

  const loadVariables = async () => {
    try {
      setLoading(true);
      const data = await api.listDocumentVariables(documentId);
      setVariables(data);
    } catch (err) {
      console.error("Failed to load variables:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-stone-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading variables...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[#1A1A1A]">Global Variables</h2>
        <p className="text-stone-500 text-sm mt-1">
          Define variables that correspond to shared values (e.g., clientId, environments, keys) across multiple APIs in this document. These act as central references.
        </p>
      </div>

      <div className="bg-white border flex flex-col border-stone-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200 text-left text-xs text-stone-500 font-medium">
              <th className="py-2.5 px-4 w-48">Name</th>
              <th className="py-2.5 px-4 w-28">Type</th>
              <th className="py-2.5 px-4 w-20 text-center">Is Enum</th>
              <th className="py-2.5 px-4">Value / Options</th>
              <th className="py-2.5 px-4 w-40">Description</th>
              <th className="py-2.5 px-4 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {variables.map((v) => (
              <VariableRow key={v.id} variable={v} documentId={documentId} onChanged={loadVariables} />
            ))}
            {variables.length === 0 && !adding && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-xs text-stone-400 italic">
                  No variables defined yet.
                </td>
              </tr>
            )}
            {adding && (
              <AddVariableRow
                documentId={documentId}
                onSaved={() => { setAdding(false); loadVariables(); }}
                onCancel={() => setAdding(false)}
              />
            )}
          </tbody>
        </table>
      </div>

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors border border-indigo-200"
        >
          <Plus className="w-4 h-4" /> Add Variable
        </button>
      )}
    </div>
  );
}

function Inp({ value, onChange, placeholder = "", className = "" }: any) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-white border border-stone-300 rounded px-2 py-1 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-indigo-400 ${className}`}
    />
  );
}

function VariableRow({ variable: v, documentId, onChanged }: { variable: DocumentVariable, documentId: string, onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: v.name,
    data_type: v.data_type ?? "",
    is_enum: v.is_enum,
    value: v.value ?? "",
    enum_values: Array.isArray(v.enum_values) ? v.enum_values.join(", ") : "",
    description: v.description ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string) => (val: any) => setForm((f) => ({ ...f, [k]: val }));

  const save = async () => {
    setSaving(true);
    try {
      const enumArr = form.enum_values.split(",").map((s) => s.trim()).filter(Boolean);
      await api.updateDocumentVariable(documentId, v.id, {
        name: form.name,
        data_type: form.data_type || undefined,
        is_enum: form.is_enum,
        value: form.is_enum ? undefined : form.value || undefined,
        enum_values: form.is_enum ? enumArr : [],
        description: form.description || undefined,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      alert("Failed to update variable");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm(`Delete variable ${v.name}?`)) return;
    try {
      await api.deleteDocumentVariable(documentId, v.id);
      onChanged();
    } catch (e) {
      alert("Failed to delete variable");
    }
  };

  if (editing) {
    return (
      <tr className="bg-indigo-50/40 border-b border-indigo-100">
        <td className="py-2.5 px-4 align-top">
          <Inp value={form.name} onChange={set("name")} placeholder="Name" />
        </td>
        <td className="py-2.5 px-4 align-top">
          <Inp value={form.data_type} onChange={set("data_type")} placeholder="String" />
        </td>
        <td className="py-2.5 px-4 align-top text-center pt-4">
          <input
            type="checkbox"
            checked={form.is_enum}
            onChange={(e) => set("is_enum")(e.target.checked)}
            className="accent-indigo-600 cursor-pointer"
          />
        </td>
        <td className="py-2.5 px-4 align-top">
          {form.is_enum ? (
            <Inp value={form.enum_values} onChange={set("enum_values")} placeholder="Comma, separated" />
          ) : (
            <Inp value={form.value} onChange={set("value")} placeholder="Fixed value" />
          )}
        </td>
        <td className="py-2.5 px-4 align-top">
          <Inp value={form.description} onChange={set("description")} placeholder="Desc" />
        </td>
        <td className="py-2.5 px-4 align-top text-right">
          <div className="flex gap-1 justify-end">
            <button onClick={save} disabled={saving} className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="p-1 rounded bg-stone-200 text-stone-600 hover:bg-stone-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50 group transition-colors">
      <td className="py-2.5 px-4 font-mono font-medium text-stone-800 flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5 text-indigo-400" />
        {v.name}
      </td>
      <td className="py-2.5 px-4 text-xs text-blue-600">{v.data_type || "—"}</td>
      <td className="py-2.5 px-4 text-center">
        {v.is_enum ? (
          <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 rounded">
            enum
          </span>
        ) : (
          <span className="text-stone-300">—</span>
        )}
      </td>
      <td className="py-2.5 px-4 text-xs text-stone-600">
        {v.is_enum ? (
          <div className="flex flex-wrap gap-1">
            {(v.enum_values || []).map((ev, i) => (
              <span key={i} className="bg-stone-100 border border-stone-200 px-1.5 rounded">{ev}</span>
            ))}
          </div>
        ) : (
          <span className={v.value ? "font-mono bg-stone-100 px-1 rounded" : "text-stone-400"}>{v.value || "—"}</span>
        )}
      </td>
      <td className="py-2.5 px-4 text-xs text-stone-500 max-w-[200px] truncate" title={v.description}>
        {v.description || "—"}
      </td>
      <td className="py-2.5 px-4 text-right">
        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="p-1 rounded text-stone-400 hover:text-indigo-600 hover:bg-indigo-50">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={del} className="p-1 rounded text-stone-400 hover:text-red-500 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddVariableRow({ documentId, onSaved, onCancel }: { documentId: string, onSaved: () => void, onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "",
    data_type: "String",
    is_enum: false,
    value: "",
    enum_values: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string) => (val: any) => setForm((f) => ({ ...f, [k]: val }));

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const enumArr = form.enum_values.split(",").map((s) => s.trim()).filter(Boolean);
      await api.createDocumentVariable(documentId, {
        name: form.name,
        data_type: form.data_type || undefined,
        is_enum: form.is_enum,
        value: form.is_enum ? undefined : form.value || undefined,
        enum_values: form.is_enum ? enumArr : [],
        description: form.description || undefined,
      });
      onSaved();
    } catch (e) {
      alert("Failed to create variable");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-indigo-50/40 border-b border-indigo-100">
      <td className="py-2.5 px-4 align-top">
        <Inp value={form.name} onChange={set("name")} placeholder="Variable Name *" />
      </td>
      <td className="py-2.5 px-4 align-top">
        <Inp value={form.data_type} onChange={set("data_type")} placeholder="String" />
      </td>
      <td className="py-2.5 px-4 align-top text-center pt-4">
        <input
          type="checkbox"
          checked={form.is_enum}
          onChange={(e) => set("is_enum")(e.target.checked)}
          className="accent-indigo-600 cursor-pointer"
        />
      </td>
      <td className="py-2.5 px-4 align-top">
        {form.is_enum ? (
          <Inp value={form.enum_values} onChange={set("enum_values")} placeholder="Val1, Val2, Val3" />
        ) : (
          <Inp value={form.value} onChange={set("value")} placeholder="Fixed value" />
        )}
      </td>
      <td className="py-2.5 px-4 align-top">
        <Inp value={form.description} onChange={set("description")} placeholder="Description" />
      </td>
      <td className="py-2.5 px-4 align-top text-right">
        <div className="flex gap-1 justify-end">
          <button onClick={save} disabled={saving || !form.name} className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" />
          </button>
          <button onClick={onCancel} className="p-1 rounded bg-stone-200 text-stone-600 hover:bg-stone-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
