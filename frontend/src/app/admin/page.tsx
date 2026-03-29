"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api/client";
import { RotateCcw, Save, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

type Prompt = { label: string; description: string; value: string };
type Prompts = Record<string, Prompt>;
type SaveState = "idle" | "saving" | "saved" | "error";

const PROMPT_ORDER = ["system", "extract_all", "extract_all_file", "metadata", "reextract_api"];

export default function AdminPage() {
  const [prompts, setPrompts] = useState<Prompts>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listPrompts().then((data) => {
      setPrompts(data);
      setDrafts(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.value])));
      setLoading(false);
    });
  }, []);

  const save = useCallback(async (key: string) => {
    setSaveStates((s) => ({ ...s, [key]: "saving" }));
    try {
      await api.updatePrompt(key, drafts[key]);
      setPrompts((p) => ({ ...p, [key]: { ...p[key], value: drafts[key] } }));
      setSaveStates((s) => ({ ...s, [key]: "saved" }));
      setTimeout(() => setSaveStates((s) => ({ ...s, [key]: "idle" })), 2000);
    } catch {
      setSaveStates((s) => ({ ...s, [key]: "error" }));
    }
  }, [drafts]);

  const reset = useCallback(async (key: string) => {
    setSaveStates((s) => ({ ...s, [key]: "saving" }));
    try {
      const result = await api.resetPrompt(key);
      setDrafts((d) => ({ ...d, [key]: result.value }));
      setPrompts((p) => ({ ...p, [key]: { ...p[key], value: result.value } }));
      setSaveStates((s) => ({ ...s, [key]: "saved" }));
      setTimeout(() => setSaveStates((s) => ({ ...s, [key]: "idle" })), 2000);
    } catch {
      setSaveStates((s) => ({ ...s, [key]: "error" }));
    }
  }, []);

  const toggleCollapse = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const isDirty = (key: string) => drafts[key] !== prompts[key]?.value;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading prompts…
      </div>
    );
  }

  const orderedKeys = [
    ...PROMPT_ORDER.filter((k) => k in prompts),
    ...Object.keys(prompts).filter((k) => !PROMPT_ORDER.includes(k)),
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Prompt Editor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Edit the AI prompts used during extraction. Changes take effect on the next extraction run.
        </p>
      </div>

      <div className="space-y-4">
        {orderedKeys.map((key) => {
          const prompt = prompts[key];
          const draft = drafts[key] ?? "";
          const state = saveStates[key] ?? "idle";
          const dirty = isDirty(key);
          const isCollapsed = collapsed[key] ?? false;

          return (
            <div key={key} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
              {/* Header */}
              <button
                onClick={() => toggleCollapse(key)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">{prompt.label}</span>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {key}
                      </span>
                      {dirty && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                          unsaved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{prompt.description}</p>
                  </div>
                </div>
                {isCollapsed
                  ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  : <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                }
              </button>

              {/* Editor */}
              {!isCollapsed && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    className="w-full font-mono text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                    rows={Math.min(Math.max(draft.split("\n").length + 2, 8), 40)}
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">
                      {draft.length} chars · {draft.split("\n").length} lines
                    </span>
                    <div className="flex items-center gap-2">
                      {state === "saved" && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle className="w-3.5 h-3.5" /> Saved
                        </span>
                      )}
                      {state === "error" && (
                        <span className="flex items-center gap-1 text-xs text-red-500">
                          <AlertCircle className="w-3.5 h-3.5" /> Error
                        </span>
                      )}
                      <button
                        onClick={() => reset(key)}
                        disabled={state === "saving"}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset to default
                      </button>
                      <button
                        onClick={() => save(key)}
                        disabled={!dirty || state === "saving"}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Save className="w-3 h-3" />
                        {state === "saving" ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
