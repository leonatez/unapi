"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api/client";
import type { PlaygroundStep } from "@/lib/api/client";
import {
  RotateCcw, Save, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Play, Upload, X, Loader2, FileText, FileJson,
} from "lucide-react";

type Prompt = { label: string; description: string; value: string };
type Prompts = Record<string, Prompt>;
type SaveState = "idle" | "saving" | "saved" | "error";

const PROMPT_ORDER = ["system", "extract_all", "extract_all_file", "metadata", "reextract_api"];

// ─── Prompt Editor ──────────────────────────────────────────────────

function PromptList() {
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
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        Loading prompts…
      </div>
    );
  }

  const orderedKeys = [
    ...PROMPT_ORDER.filter((k) => k in prompts),
    ...Object.keys(prompts).filter((k) => !PROMPT_ORDER.includes(k)),
  ];

  return (
    <div className="space-y-4">
      {orderedKeys.map((key) => {
        const prompt = prompts[key];
        const draft = drafts[key] ?? "";
        const state = saveStates[key] ?? "idle";
        const dirty = isDirty(key);
        const isCollapsed = collapsed[key] ?? false;

        return (
          <div key={key} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
            <button
              onClick={() => toggleCollapse(key)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
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
              {isCollapsed
                ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                : <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              }
            </button>

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
  );
}

// ─── Playground ─────────────────────────────────────────────────────

function FileDropZone({
  label, hint, accept, file, onFile, icon: Icon,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  icon: React.ElementType;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (f: File | null) => {
    if (f) onFile(f);
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-700 mb-1.5 block">{label}</label>
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
          <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-xs text-gray-700 truncate flex-1">{file.name}</span>
          <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
          <button
            onClick={() => onFile(null)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handle(e.dataTransfer.files[0] ?? null);
          }}
          className={`w-full flex flex-col items-center gap-1.5 px-4 py-4 border-2 border-dashed rounded-lg transition-colors text-center
            ${dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"}`}
        >
          <Upload className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500">{hint}</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

const STEP_COLORS: Record<string, string> = {
  text:     "bg-gray-50 text-gray-700",
  markdown: "bg-slate-50 text-slate-800",
  prompt:   "bg-violet-50 text-violet-900",
  json_raw: "bg-amber-50 text-amber-900",
  json:     "bg-emerald-50 text-emerald-900",
  error:    "bg-red-50 text-red-800",
};

const STEP_BADGES: Record<string, string> = {
  text:     "bg-gray-100 text-gray-500",
  markdown: "bg-slate-200 text-slate-600",
  prompt:   "bg-violet-100 text-violet-700",
  json_raw: "bg-amber-100 text-amber-700",
  json:     "bg-emerald-100 text-emerald-700",
  error:    "bg-red-100 text-red-700",
};

const STEP_TYPE_LABELS: Record<string, string> = {
  text:     "text",
  markdown: "markdown",
  prompt:   "prompt",
  json_raw: "raw response",
  json:     "parsed json",
  error:    "error",
};

function StepCard({ step, index }: { step: PlaygroundStep; index: number }) {
  const [open, setOpen] = useState(index >= 3); // open last few steps by default

  const content =
    step.type === "json"
      ? JSON.stringify(step.content, null, 2)
      : typeof step.content === "string"
      ? step.content
      : JSON.stringify(step.content, null, 2);

  const lineCount = content.split("\n").length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left gap-3"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xs font-mono text-gray-400 w-5 text-right shrink-0">{index + 1}</span>
          <span className="text-sm font-medium text-gray-800 truncate">{step.label}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${STEP_BADGES[step.type] ?? "bg-gray-100 text-gray-500"}`}>
            {STEP_TYPE_LABELS[step.type] ?? step.type}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
          {open
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </button>

      {open && (
        <div className={`border-t border-gray-100 ${STEP_COLORS[step.type] ?? "bg-gray-50"}`}>
          <pre className="text-xs font-mono p-4 whitespace-pre-wrap break-all overflow-auto max-h-[500px] leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function Playground() {
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [selectionFile, setSelectionFile] = useState<File | null>(null);
  const [sequenceFile, setSequenceFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<PlaygroundStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!specFile) return;
    setRunning(true);
    setSteps(null);
    setError(null);

    try {
      let selection;
      let sequence;

      const parseJsonFile = async (file: File, label: string) => {
        const text = (await file.text()).replace(/^\uFEFF/, ""); // strip BOM
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`${label}: invalid JSON — ${file.name}`);
        }
      };

      if (selectionFile) selection = await parseJsonFile(selectionFile, "Sheet selection");
      if (sequenceFile) sequence = await parseJsonFile(sequenceFile, "Flow sequence");

      const result = await api.runPlayground(specFile, selection, sequence);
      setSteps(result.steps);
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Uploads */}
      <div className="border border-gray-200 rounded-xl bg-white p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Playground</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload a tech spec and optional hint files, then run to see every step sent to AI.
          </p>
        </div>

        <FileDropZone
          label="Tech Spec File *"
          hint="Drop XLSX, PDF, DOCX, or any supported format"
          accept=".xlsx,.pdf,.docx,.doc,.txt,.md"
          file={specFile}
          onFile={setSpecFile}
          icon={FileText}
        />

        <div className="grid grid-cols-2 gap-3">
          <FileDropZone
            label="Sheet Selection (optional)"
            hint="sheet-selection.json"
            accept=".json"
            file={selectionFile}
            onFile={setSelectionFile}
            icon={FileJson}
          />
          <FileDropZone
            label="Flow Sequence (optional)"
            hint="flow-sequence.json"
            accept=".json"
            file={sequenceFile}
            onFile={setSequenceFile}
            icon={FileJson}
          />
        </div>

        <div className="pt-1">
          <p className="text-[11px] text-gray-400 mb-3">
            <strong className="text-gray-500">sheet-selection.json</strong> format:{" "}
            <code className="bg-gray-100 px-1 rounded">{"{ \"selected_sheets\": [...], \"sheet_kinds\": {...} }"}</code>
          </p>
          <button
            onClick={run}
            disabled={!specFile || running}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
            ) : (
              <><Play className="w-4 h-4" /> Run Playground</>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-3 border border-red-200 bg-red-50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Steps */}
      {steps && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Extraction Steps <span className="text-gray-400 font-normal">({steps.length})</span>
            </h3>
            {!error && steps.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" /> Complete
              </span>
            )}
          </div>
          {steps.map((step, i) => (
            <StepCard key={i} step={step} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <div className="flex h-full min-h-screen">
      {/* Left: prompt list */}
      <div className="w-[520px] shrink-0 border-r border-gray-200 overflow-y-auto">
        <div className="px-6 py-8">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-gray-900">Prompt Editor</h1>
            <p className="text-xs text-gray-500 mt-1">
              Edit the AI prompts used during extraction. Changes take effect on the next run.
            </p>
          </div>
          <PromptList />
        </div>
      </div>

      {/* Right: playground */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-6 py-8 max-w-3xl">
          <Playground />
        </div>
      </div>
    </div>
  );
}
