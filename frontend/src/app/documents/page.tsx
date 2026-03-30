"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import {
  FileText, Loader2, CheckCircle, XCircle,
  Eye, Download, Trash2, Building2, User, ExternalLink,
  ChevronDown, ChevronUp, ArrowRight, RotateCcw, Table2, Plus, X, GitBranch,
} from "lucide-react";
import { api, Document, ExtractionDraft, ExtractionDraftFlow, SheetInfo } from "@/lib/api/client";

// ─── Pipeline state machine ────────────────────────────────────

type FlowStep = { id: string; sheetName: string; label: string };
type FlowSequenceMap = Record<string, FlowStep[]>;

type PipelineState =
  | { step: "idle" }
  | { step: "uploading" }
  | { step: "sheet_selection"; docId: string; sheets: SheetInfo[] }
  | { step: "flow_sequencer"; docId: string; sheets: SheetInfo[]; selectedSheets: string[]; sheetKinds: Record<string, string> }
  | { step: "uploading_to_gemini"; docId: string }
  | { step: "markdown_review"; docId: string; markdown: string; from: "upload" | "extraction_review"; prevDraft?: ExtractionDraft }
  | { step: "extracting"; docId: string }
  | { step: "extraction_review"; docId: string; draft: ExtractionDraft }
  | { step: "approving"; docId: string }
  | { step: "done"; docId: string; flows: number; apis: number }
  | { step: "error"; message: string; docId?: string };

// XLSX:     Upload → Sheet Selection → Flow Sequencer → Extraction Review
// Non-XLSX: Upload → Markdown Review → Extraction Review
const STEP_LABELS_XLSX = ["1. Upload", "2. Sheet Selection", "3. Flow Sequencer", "4. Extraction Review"];
const STEP_LABELS_MD   = ["1. Upload", "2. Markdown Review", "3. Extraction Review"];

function stepIndexXlsx(s: PipelineState["step"]): number {
  if (s === "uploading") return 0;
  if (s === "sheet_selection") return 1;
  if (s === "flow_sequencer") return 2;
  if (s === "uploading_to_gemini" || s === "extracting") return 3;
  if (s === "extraction_review" || s === "approving") return 3;
  return 4;
}

function stepIndexMd(s: PipelineState["step"]): number {
  if (s === "uploading") return 0;
  if (s === "markdown_review" || s === "extracting") return 1;
  if (s === "extraction_review" || s === "approving") return 2;
  return 3;
}

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-emerald-700",
  POST:   "text-blue-600",
  PUT:    "text-amber-700",
  PATCH:  "text-purple-700",
  DELETE: "text-red-600",
};

// ─── Sheet kind badge ──────────────────────────────────────────

const KIND_SIGNALS: Record<string, { label: string; color: string }> = {
  flow:       { label: "Flow",        color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  api_spec:   { label: "API Spec",    color: "bg-blue-50 text-blue-700 border-blue-200" },
  error_code: { label: "Error Codes", color: "bg-red-50 text-red-700 border-red-200" },
  edge_case:  { label: "Edge Cases",  color: "bg-amber-50 text-amber-700 border-amber-200" },
  mapping:    { label: "Mapping",     color: "bg-purple-50 text-purple-700 border-purple-200" },
  metadata:   { label: "Metadata",    color: "bg-stone-100 text-stone-600 border-stone-200" },
};

// Normalize flow name: collapse whitespace, trim (keep original casing for display)
const normalizeFlowName = (s: string) => s.trim().replace(/\s+/g, " ");

function guessKind(sheet: SheetInfo): string {
  const nameLower = normalizeFlowName(sheet.name).toLowerCase();
  if (/\b(flow|sequence|diagram|workflow)\b/.test(nameLower)) return "flow";

  const text = [sheet.name, ...sheet.preview.flat()].join(" ").toLowerCase();
  if (/flow diagram|sequence diagram|process flow/.test(text)) return "flow";
  if (/\b(url|method|request|response|header|body|endpoint|path)\b/.test(text)) return "api_spec";
  if (/error.?code|result.?code|result.?status|rcode/.test(text)) return "error_code";
  if (/edge.?case|retry|inquiry|handling.?logic/.test(text)) return "edge_case";
  if (/mapping|lookup|province.?code|district.?code/.test(text)) return "mapping";
  if (/change.?log|revision|version|overview|introduction/.test(text)) return "metadata";
  return "metadata";
}

// ─── Flow sequencer panel ──────────────────────────────────────

function FlowSequencerPanel({
  sheets,
  selectedSheets,
  sheetKinds,
  onConfirm,
  onSkip,
  onBack,
}: {
  sheets: SheetInfo[];
  selectedSheets: string[];
  sheetKinds: Record<string, string>;
  onConfirm: (sequence: Record<string, { sheet_name: string; label: string }[]>) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const detectedFlows = useMemo(() => {
    const seen = new Set<string>();
    return selectedSheets
      .filter((n) => sheetKinds[n] === "flow")
      .map(normalizeFlowName)
      .filter((n) => { const k = n.toLowerCase(); return seen.has(k) ? false : (seen.add(k), true); });
  }, [selectedSheets, sheetKinds]);

  const apiSheets = selectedSheets.filter((n) => sheetKinds[n] === "api_spec");

  const [flows, setFlows]           = useState<string[]>(() => detectedFlows);
  const [activeFlow, setActiveFlow] = useState<string>(detectedFlows[0] ?? "");
  const [sequences, setSequences]   = useState<FlowSequenceMap>({});
  const [customInput, setCustomInput] = useState("");
  const flowImportRef = useRef<HTMLInputElement>(null);

  const steps: FlowStep[] = sequences[activeFlow] ?? [];

  const addStep = (sheetName: string) => {
    if (!activeFlow) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSequences((p) => ({ ...p, [activeFlow]: [...(p[activeFlow] ?? []), { id, sheetName, label: sheetName }] }));
  };

  const removeStep = (id: string) =>
    setSequences((p) => ({ ...p, [activeFlow]: (p[activeFlow] ?? []).filter((s) => s.id !== id) }));

  const moveStep = (idx: number, dir: -1 | 1) =>
    setSequences((p) => {
      const arr = [...(p[activeFlow] ?? [])];
      const ni = idx + dir;
      if (ni < 0 || ni >= arr.length) return p;
      [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
      return { ...p, [activeFlow]: arr };
    });

  const setLabel = (id: string, label: string) =>
    setSequences((p) => ({
      ...p,
      [activeFlow]: (p[activeFlow] ?? []).map((s) => (s.id === id ? { ...s, label } : s)),
    }));

  const addCustomFlow = () => {
    const name = normalizeFlowName(customInput);
    if (!name) return;
    if (!flows.find((f) => f.toLowerCase() === name.toLowerCase())) {
      setFlows((p) => [...p, name]);
    }
    setActiveFlow(name);
    setCustomInput("");
  };

  const handleConfirm = () => {
    const clean: Record<string, { sheet_name: string; label: string }[]> = {};
    for (const [flowName, flowSteps] of Object.entries(sequences)) {
      if (flowSteps.length > 0) {
        clean[flowName] = flowSteps.map(({ sheetName: sheet_name, label }) => ({ sheet_name, label }));
      }
    }
    onConfirm(clean);
  };

  const hasSteps = Object.values(sequences).some((s) => s.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-900">
            Arrange flow steps{" "}
            <span className="text-stone-400 font-normal text-xs">(optional — skip to let AI decide)</span>
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            Define the order of API calls per flow. Helps AI reconstruct sequences accurately from diagrams.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
          >
            ← Back
          </button>
          {/* Export */}
          <button
            onClick={() => {
              const payload = { flows, sequences };
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "flow-sequence.json"; a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
            title="Export flow sequences to JSON"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          {/* Import */}
          <input ref={flowImportRef} type="file" accept=".json" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            file.text().then((text) => {
              try {
                const data = JSON.parse(text);
                if (Array.isArray(data.flows)) setFlows(data.flows);
                if (data.sequences) {
                  const restored: FlowSequenceMap = {};
                  for (const [flow, steps] of Object.entries(data.sequences as FlowSequenceMap)) {
                    restored[flow] = (steps as FlowStep[]).map((s) => ({
                      ...s,
                      id: s.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    }));
                  }
                  setSequences(restored);
                  if (data.flows?.[0]) setActiveFlow(data.flows[0]);
                }
              } catch { /* ignore malformed */ }
            });
            e.target.value = "";
          }} />
          <button
            onClick={() => flowImportRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
            title="Import flow sequences from JSON"
          >
            <Plus className="w-3 h-3" /> Import
          </button>
          <button
            onClick={onSkip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
          >
            Skip <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={handleConfirm}
            disabled={!hasSteps}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" /> Use sequence
          </button>
        </div>
      </div>

      {/* Flow tabs + custom input */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {flows.map((f) => {
          const count = sequences[f]?.length ?? 0;
          return (
            <button
              key={f}
              onClick={() => setActiveFlow(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                activeFlow === f
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "border-stone-200 text-stone-600 hover:text-stone-900 hover:border-stone-300 bg-white"
              }`}
            >
              {f}{count > 0 && <span className="ml-1.5 opacity-70">{count} steps</span>}
            </button>
          );
        })}
        {/* Inline add-custom-flow */}
        <div className="flex items-center gap-1">
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomFlow()}
            placeholder="+ Add flow name…"
            className="text-xs bg-white border border-stone-200 rounded-lg px-2 py-1 text-stone-700 placeholder-stone-400 focus:outline-none focus:border-indigo-400 w-40 transition-colors"
          />
          {customInput.trim() && (
            <button
              onClick={addCustomFlow}
              className="text-xs px-2 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-800 transition-colors"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {/* Two-column: API sheets | Sequence */}
      {(flows.length > 0 || customInput) && (
        <div className="flex gap-3" style={{ height: "300px" }}>
          {/* Left: available API sheets */}
          <div className="w-52 shrink-0 flex flex-col border border-stone-200 rounded-xl overflow-hidden bg-white">
            <div className="px-3 py-2 bg-stone-50 border-b border-stone-200 text-[10px] font-semibold text-stone-500 uppercase tracking-wide">
              API Sheets — click to add
            </div>
            <div className="overflow-y-auto flex-1">
              {apiSheets.length === 0 ? (
                <p className="px-3 py-4 text-xs text-stone-400 italic text-center">No API spec sheets selected</p>
              ) : (
                apiSheets.map((name) => (
                  <button
                    key={name}
                    onClick={() => addStep(name)}
                    disabled={!activeFlow}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-stone-700 hover:bg-stone-50 hover:text-stone-900 border-b border-stone-100 last:border-b-0 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="truncate">{name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: sequence for active flow */}
          <div className="flex-1 flex flex-col border border-stone-200 rounded-xl overflow-hidden bg-white">
            <div className="px-3 py-2 bg-stone-50 border-b border-stone-200 text-[10px] font-semibold text-stone-500 uppercase tracking-wide">
              {activeFlow ? `Steps for: ${activeFlow}` : "Select or add a flow above"}
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {!activeFlow ? (
                <p className="text-xs text-stone-400 italic text-center py-8">Select a flow tab above to start</p>
              ) : steps.length === 0 ? (
                <p className="text-xs text-stone-400 italic text-center py-8">
                  Click API sheets on the left to add steps
                </p>
              ) : (
                steps.map((step, idx) => (
                  <div key={step.id} className="flex items-center gap-2 px-2 py-1.5 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-[10px] text-stone-400 w-4 text-center shrink-0 font-mono">{idx + 1}</span>
                    <span
                      className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0 max-w-[120px] truncate"
                      title={step.sheetName}
                    >
                      {step.sheetName}
                    </span>
                    <input
                      value={step.label}
                      onChange={(e) => setLabel(step.id, e.target.value)}
                      placeholder="Step label…"
                      className="flex-1 text-xs bg-white border border-stone-200 rounded px-2 py-0.5 text-stone-700 placeholder-stone-400 focus:outline-none focus:border-indigo-400 transition-colors min-w-0"
                    />
                    <div className="flex gap-0.5 shrink-0">
                      <button
                        onClick={() => moveStep(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-stone-400 hover:text-stone-900 disabled:opacity-30 transition-colors"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                        className="p-1 text-stone-400 hover:text-stone-900 disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        className="p-1 text-stone-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state: no flows detected and nothing typed */}
      {flows.length === 0 && !customInput && (
        <div className="text-center py-6 text-xs text-stone-400 border border-dashed border-stone-200 rounded-xl">
          No flow sheets detected. Type a flow name above to start, or skip this step.
        </div>
      )}
    </div>
  );
}

// ─── Sheet selection panel ─────────────────────────────────────

function SheetSelectionPanel({
  docId,
  sheets,
  onConfirm,
}: {
  docId: string;
  sheets: SheetInfo[];
  onConfirm: (selected: string[], kinds: Record<string, string>) => void;
}) {
  const [kindOverrides, setKindOverrides] = useState<Record<string, string>>({});
  const importRef = useRef<HTMLInputElement>(null);

  const resolvedKind = (sheet: SheetInfo) => kindOverrides[sheet.name] ?? guessKind(sheet);

  const [selected, setSelected] = useState<Set<string>>(() => {
    const auto = sheets
      .filter((s) => ["api_spec", "error_code", "edge_case"].includes(guessKind(s)))
      .map((s) => s.name);
    return new Set(auto.length > 0 ? auto : sheets.map((s) => s.name));
  });
  const [preview, setPreview] = useState<SheetInfo | null>(sheets[0] ?? null);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleAll = () =>
    setSelected(selected.size === sheets.length ? new Set() : new Set(sheets.map((s) => s.name)));

  const setKind = (sheetName: string, kind: string) =>
    setKindOverrides((prev) => ({ ...prev, [sheetName]: kind }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-900">Select sheets to send to AI</p>
          <p className="text-xs text-stone-500 mt-0.5">
            Only selected sheets will be processed. Uncheck changelog, mapping, or metadata sheets to save tokens.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {/* Export */}
          <button
            onClick={() => {
              const allKinds: Record<string, string> = {};
              sheets.forEach((s) => { allKinds[s.name] = resolvedKind(s); });
              const payload = { selected: Array.from(selected), kinds: allKinds };
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "sheet-selection.json"; a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
            title="Export current selection to JSON"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          {/* Import */}
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            file.text().then((text) => {
              try {
                const data = JSON.parse(text);
                if (data.selected) setSelected(new Set(data.selected as string[]));
                if (data.kinds) setKindOverrides(data.kinds);
              } catch { /* ignore malformed */ }
            });
            e.target.value = "";
          }} />
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
            title="Import selection from JSON"
          >
            <Plus className="w-3 h-3" /> Import
          </button>
          <button
            onClick={() => {
              if (selected.size === 0) return;
              const selectedArr = Array.from(selected);
              const allKinds: Record<string, string> = {};
              sheets.forEach((s) => { allKinds[s.name] = resolvedKind(s); });
              onConfirm(selectedArr, allKinds);
            }}
            disabled={selected.size === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            Send to AI <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sheet list + preview side by side */}
      <div className="flex gap-3 min-h-0" style={{ height: "360px" }}>
        {/* Sheet list */}
        <div className="w-56 shrink-0 flex flex-col border border-stone-200 rounded-xl overflow-hidden bg-white">
          {/* Toggle all */}
          <button
            onClick={toggleAll}
            className="flex items-center justify-between px-3 py-2 text-xs font-medium text-stone-500 hover:text-stone-900 bg-stone-50 border-b border-stone-200 transition-colors"
          >
            <span>{selected.size}/{sheets.length} selected</span>
            <span className="text-indigo-500 hover:text-indigo-700">{selected.size === sheets.length ? "Deselect all" : "Select all"}</span>
          </button>
          <div className="overflow-y-auto flex-1">
            {sheets.map((sheet) => {
              const kind     = resolvedKind(sheet);
              const isAuto   = !kindOverrides[sheet.name];
              const badge    = KIND_SIGNALS[kind] ?? KIND_SIGNALS.metadata;
              const isSelected = selected.has(sheet.name);
              const isActive   = preview?.name === sheet.name;
              return (
                <div
                  key={sheet.name}
                  className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-stone-100 last:border-b-0 transition-colors ${
                    isActive ? "bg-stone-100" : "hover:bg-stone-50"
                  }`}
                  onClick={() => setPreview(sheet)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(sheet.name)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 accent-indigo-500 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-stone-900 truncate">{sheet.name}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {/* Editable kind badge — click to correct */}
                      <select
                        value={kind}
                        onChange={(e) => { e.stopPropagation(); setKind(sheet.name, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        title="Click to correct the detected type"
                        className={`text-[10px] px-1 py-0.5 rounded border font-medium bg-transparent cursor-pointer appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-400 ${badge.color} ${isAuto ? "opacity-80" : "ring-1 ring-indigo-400"}`}
                      >
                        {Object.entries(KIND_SIGNALS).map(([k, { label }]) => (
                          <option key={k} value={k} className="bg-white text-stone-800 font-normal">
                            {label}
                          </option>
                        ))}
                      </select>
                      {!isAuto && (
                        <span className="text-[9px] text-indigo-500" title="Manually set">edited</span>
                      )}
                      <span className="text-[10px] text-stone-400">{sheet.row_count}r</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preview pane */}
        <div className="flex-1 min-w-0 border border-stone-200 rounded-xl overflow-hidden flex flex-col bg-white">
          {preview ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 border-b border-stone-200 shrink-0">
                <Table2 className="w-3.5 h-3.5 text-stone-400" />
                <span className="text-xs font-medium text-stone-700">{preview.name}</span>
                {(() => {
                  const k = resolvedKind(preview);
                  const b = KIND_SIGNALS[k] ?? KIND_SIGNALS.metadata;
                  return (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${b.color}`}>
                      {b.label}
                    </span>
                  );
                })()}
                <span className="text-xs text-stone-400 ml-auto">{preview.row_count} rows · {preview.col_count} cols</span>
              </div>
              <div className="overflow-auto flex-1 text-xs">
                {preview.preview.length === 0 ? (
                  <p className="px-4 py-6 text-stone-400 italic text-center">Empty sheet</p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {preview.preview[0].map((cell, ci) => (
                          <th
                            key={ci}
                            className="px-2 py-1.5 text-left font-medium text-stone-700 bg-stone-50 border-b border-stone-200 whitespace-nowrap sticky top-0"
                          >
                            {cell || <span className="text-stone-300 italic">—</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.slice(1).map((row, ri) => (
                        <tr key={ri} className="border-b border-stone-100 hover:bg-stone-50">
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className="px-2 py-1.5 text-stone-600 max-w-[200px] truncate"
                              title={cell}
                            >
                              {cell || <span className="text-stone-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {preview.row_count > 5 && (
                  <p className="px-3 py-2 text-[10px] text-stone-400 italic border-t border-stone-100">
                    Showing first 5 of {preview.row_count} rows
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-stone-400 text-xs">
              Click a sheet to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Flow preview card ─────────────────────────────────────────

function FlowCard({ flow }: { flow: ExtractionDraftFlow }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 hover:bg-stone-100 text-left transition-colors"
      >
        <div>
          <span className="font-semibold text-stone-900 text-sm">{flow.name}</span>
          {flow.description && (
            <span className="ml-3 text-xs text-stone-500 font-normal">{flow.description}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-stone-500 shrink-0">
          <span className="bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full font-medium">{flow.apis.length} APIs</span>
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-stone-100">
          {flow.apis.length === 0 ? (
            <p className="px-4 py-3 text-xs text-stone-400 italic">No APIs extracted in this flow.</p>
          ) : (
            flow.apis.map((a, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                {a.method ? (
                  <span className={`text-xs font-mono font-bold w-14 shrink-0 ${METHOD_COLORS[a.method] ?? "text-stone-400"}`}>
                    {a.method}
                  </span>
                ) : (
                  <span className="w-14 shrink-0" />
                )}
                <span className="text-sm text-stone-900 font-medium">{a.name}</span>
                {a.path && <span className="text-xs text-stone-400 font-mono">{a.path}</span>}
                {a.confidence_score !== undefined && a.confidence_score < 0.7 && (
                  <span className="ml-auto text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    low confidence
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton card ─────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="p-4 rounded-xl border border-stone-200 bg-white animate-pulse shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-5 w-14 bg-stone-200 rounded-full" />
        <div className="h-4 w-10 bg-stone-200 rounded" />
      </div>
      <div className="h-5 w-48 bg-stone-200 rounded mb-1" />
      <div className="h-4 w-32 bg-stone-200 rounded" />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs]         = useState<Document[]>([]);
  const [loading, setLoading]   = useState(true);
  const [owner, setOwner]       = useState<"Monee" | "Bank">("Monee");
  const [parser]                = useState("markitdown");
  const [pipeline, setPipeline] = useState<PipelineState>({ step: "idle" });
  const [isXlsx, setIsXlsx]     = useState(false);
  const fileRef     = useRef<HTMLInputElement>(null);
  const markdownRef = useRef<HTMLTextAreaElement>(null);

  const stepLabels     = isXlsx ? STEP_LABELS_XLSX : STEP_LABELS_MD;
  const currentStepIdx = isXlsx
    ? stepIndexXlsx(pipeline.step)
    : stepIndexMd(pipeline.step);

  const load = async () => {
    const data = await api.listDocuments();
    setDocs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Step 1: Upload ───────────────────────────────────────────

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const xlsx = file.name.toLowerCase().endsWith(".xlsx");
    setIsXlsx(xlsx);

    const form = new FormData();
    form.append("file", file);
    form.append("owner", owner);
    form.append("parser", parser);

    setPipeline({ step: "uploading" });
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/documents/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) {
        setPipeline({ step: "error", message: data?.detail || `Server error ${res.status}` });
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      load();

      if (data.is_xlsx) {
        setPipeline({ step: "sheet_selection", docId: data.document_id, sheets: data.sheets });
      } else {
        setPipeline({ step: "markdown_review", docId: data.document_id, markdown: data.markdown ?? "", from: "upload" });
      }
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  };

  // ── Step 1b: Sheet selection → flow sequencer ─────────────────

  const handleSheetConfirm = (selectedSheets: string[], sheetKinds: Record<string, string>) => {
    if (pipeline.step !== "sheet_selection") return;
    setPipeline({
      step: "flow_sequencer",
      docId: pipeline.docId,
      sheets: pipeline.sheets,
      selectedSheets,
      sheetKinds,
    });
  };

  // ── Step 1c: Flow sequencer → upload to Gemini → extract ──────

  const uploadAndExtract = async (
    docId: string,
    selectedSheets: string[],
    sheetKinds: Record<string, string>,
    flowSequence?: Record<string, { sheet_name: string; label: string }[]>,
  ) => {
    setPipeline({ step: "uploading_to_gemini", docId });
    try {
      await api.selectSheets(docId, selectedSheets, sheetKinds, flowSequence);
      setPipeline({ step: "extracting", docId });
      const res = await api.extractDocument(docId);
      if (res.draft._error) {
        setPipeline({ step: "error", message: `AI extraction failed: ${res.draft._error}`, docId });
        return;
      }
      setPipeline({ step: "extraction_review", docId, draft: res.draft });
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Upload or extraction failed", docId });
    }
  };

  // Resume from file_ready state
  const resumeExtraction = async (docId: string) => {
    setIsXlsx(true);
    setPipeline({ step: "extracting", docId });
    try {
      const res = await api.extractDocument(docId);
      if (res.draft._error) {
        setPipeline({ step: "error", message: `AI extraction failed: ${res.draft._error}`, docId });
        return;
      }
      setPipeline({ step: "extraction_review", docId, draft: res.draft });
      load();
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Extraction failed", docId });
    }
  };

  const handleSequenceConfirm = (sequence: Record<string, { sheet_name: string; label: string }[]>) => {
    if (pipeline.step !== "flow_sequencer") return;
    uploadAndExtract(pipeline.docId, pipeline.selectedSheets, pipeline.sheetKinds, sequence);
  };

  const handleSequenceSkip = () => {
    if (pipeline.step !== "flow_sequencer") return;
    uploadAndExtract(pipeline.docId, pipeline.selectedSheets, pipeline.sheetKinds);
  };

  const handleSequenceBack = () => {
    if (pipeline.step !== "flow_sequencer") return;
    setPipeline({ step: "sheet_selection", docId: pipeline.docId, sheets: pipeline.sheets });
  };

  // ── Step 2: AI Extraction ────────────────────────────────────

  const handleExtract = async () => {
    if (pipeline.step !== "markdown_review") return;
    const { docId } = pipeline;
    const markdown = markdownRef.current?.value ?? pipeline.markdown;

    setPipeline({ step: "extracting", docId });
    try {
      await api.updateMarkdown(docId, markdown);
      const res = await api.extractDocument(docId);
      if (res.draft._error) {
        setPipeline({ step: "error", message: `AI extraction failed: ${res.draft._error}` });
        return;
      }
      setPipeline({ step: "extraction_review", docId, draft: res.draft });
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Extraction failed" });
    }
  };

  // ── Step 3: Approve & Save ───────────────────────────────────

  const handleApprove = async () => {
    if (pipeline.step !== "extraction_review") return;
    const { docId } = pipeline;
    setPipeline({ step: "approving", docId });
    try {
      const res = await api.approveExtraction(docId);
      load();
      setPipeline({ step: "done", docId, flows: res.flows, apis: res.apis });
    } catch (err: unknown) {
      setPipeline({ step: "error", message: err instanceof Error ? err.message : "Approve failed" });
    }
  };

  // Direct approve for documents already at extraction_review (e.g. after page refresh)
  const approveDoc = async (docId: string) => {
    try {
      await api.approveExtraction(docId);
      load();
    } catch (err: unknown) {
      console.error("Approve failed", err);
    }
  };

  const handleBackToMarkdown = async () => {
    if (pipeline.step !== "extraction_review") return;
    const { docId, draft } = pipeline;
    const doc = await api.getDocument(docId) as Document & { markdown_content?: string };
    setPipeline({ step: "markdown_review", docId, markdown: doc.markdown_content ?? "", from: "extraction_review", prevDraft: draft });
  };

  const handleMarkdownBack = () => {
    if (pipeline.step !== "markdown_review") return;
    if (pipeline.from === "extraction_review" && pipeline.prevDraft) {
      setPipeline({ step: "extraction_review", docId: pipeline.docId, draft: pipeline.prevDraft });
    } else {
      reset();
    }
  };

  const reset = () => {
    setPipeline({ step: "idle" });
    load();
  };

  const showUploadForm = pipeline.step === "idle" || pipeline.step === "done" || pipeline.step === "error";
  const showPipeline   = pipeline.step !== "idle";
  const activeStepLabels = stepLabels;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8 animate-fade-up">
        <div className="p-[3px] rounded-[14px] bg-indigo-100 border border-indigo-200/60">
          <div className="w-9 h-9 bg-indigo-600 rounded-[11px] flex items-center justify-center shadow-sm shadow-indigo-300/40">
            <FileText className="w-4.5 h-4.5 text-white" strokeWidth={1.75} />
          </div>
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-stone-900 tracking-[-0.02em]">Documents</h1>
          <p className="text-stone-500 text-[13px]">Upload and manage API specification documents</p>
        </div>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <form
          onSubmit={handleUpload}
          className="mb-6 p-5 rounded-2xl border border-[#E4E8E0] bg-white shadow-sm animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          <div className="text-[13px] font-semibold text-stone-800 mb-4">Upload new document</div>
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-stone-500 font-medium uppercase tracking-wide">File</label>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.xlsx,.md,.pdf"
                className="text-[13px] text-stone-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-medium hover:file:bg-indigo-700 file:cursor-pointer"
              />
              <span className="text-[11px] text-stone-400">DOCX · XLSX · MD · PDF</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-stone-500 font-medium uppercase tracking-wide">Owner</label>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value as "Monee" | "Bank")}
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-[13px] text-stone-900 focus:outline-none focus:border-indigo-400 transition-colors"
              >
                <option value="Monee">Monee (internal)</option>
                <option value="Bank">Bank (partner)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-stone-500 font-medium uppercase tracking-wide">Parser</label>
              <select
                value={parser}
                disabled
                className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-[13px] text-stone-400 cursor-not-allowed"
              >
                <option value="markitdown">markitdown</option>
              </select>
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium transition-all duration-300 shadow-sm shadow-indigo-200 active:scale-[0.98]"
            >
              Upload
            </button>
          </div>
        </form>
      )}

      {/* Pipeline panel */}
      {showPipeline && (
        <div className="mb-6 border border-[#E4E8E0] rounded-2xl overflow-hidden bg-white shadow-sm animate-fade-up">
          {/* Step tabs */}
          {pipeline.step !== "done" && pipeline.step !== "error" && (
            <div className="flex border-b border-stone-100">
              {activeStepLabels.map((label, i) => {
                const done   = i < currentStepIdx;
                const active = i === currentStepIdx;
                return (
                  <div
                    key={label}
                    className={`flex-1 px-4 py-2.5 text-[11px] text-center font-semibold border-r last:border-r-0 border-stone-100 ${
                      active ? "text-indigo-600 bg-indigo-50" : done ? "text-emerald-600" : "text-stone-400"
                    }`}
                  >
                    {done && <span className="mr-1">✓</span>}{label}
                  </div>
                );
              })}
            </div>
          )}

          <div className="p-5">
            {/* Uploading */}
            {pipeline.step === "uploading" && (
              <div className="flex items-center gap-3 text-sm text-indigo-600">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div>
                  <div className="font-medium">Uploading document…</div>
                  <div className="text-xs text-indigo-500 mt-0.5">No AI yet — this is fast.</div>
                </div>
              </div>
            )}

            {/* Sheet selection (XLSX only) */}
            {pipeline.step === "sheet_selection" && (
              <SheetSelectionPanel
                docId={pipeline.docId}
                sheets={pipeline.sheets}
                onConfirm={handleSheetConfirm}
              />
            )}

            {/* Flow sequencer (XLSX only, optional) */}
            {pipeline.step === "flow_sequencer" && (
              <FlowSequencerPanel
                sheets={pipeline.sheets}
                selectedSheets={pipeline.selectedSheets}
                sheetKinds={pipeline.sheetKinds}
                onConfirm={handleSequenceConfirm}
                onSkip={handleSequenceSkip}
                onBack={handleSequenceBack}
              />
            )}

            {/* Uploading to Gemini */}
            {pipeline.step === "uploading_to_gemini" && (
              <div className="flex items-center gap-3 text-sm text-indigo-600">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div>
                  <div className="font-medium">Uploading file to Gemini…</div>
                  <div className="text-xs text-indigo-500 mt-0.5">Preparing for AI analysis — images and diagrams will be preserved.</div>
                </div>
              </div>
            )}

            {/* Markdown review */}
            {pipeline.step === "markdown_review" && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Review the parsed Markdown</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Check if the document was parsed correctly. Edit if needed, then proceed to AI extraction.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={handleMarkdownBack}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleExtract}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                    >
                      Proceed to AI Extraction <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <textarea
                  ref={markdownRef}
                  defaultValue={pipeline.markdown}
                  rows={20}
                  spellCheck={false}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-xs font-mono text-stone-800 resize-y focus:outline-none focus:border-indigo-400 transition-colors"
                />
                <p className="text-xs text-stone-400">
                  Tip: Remove noise, fix table formatting, or correct section headings before extraction.
                </p>
              </div>
            )}

            {/* Extracting */}
            {pipeline.step === "extracting" && (
              <div className="flex items-center gap-3 text-sm text-indigo-600">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div>
                  <div className="font-medium">AI is analyzing the document…</div>
                  <div className="text-xs text-indigo-500 mt-0.5">
                    Extracting flows, APIs, fields, and error codes. This may take 20–60 s.
                  </div>
                </div>
              </div>
            )}

            {/* Extraction review */}
            {pipeline.step === "extraction_review" && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Review extracted flows & APIs</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {pipeline.draft.flows.length} flow{pipeline.draft.flows.length !== 1 ? "s" : ""} extracted.
                      Verify the results, then approve to save.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={handleBackToMarkdown}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Edit Markdown
                    </button>
                    <button
                      onClick={handleApprove}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve & Save
                    </button>
                  </div>
                </div>
                {pipeline.draft.flows.length === 0 ? (
                  <div className="flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <span className="text-base shrink-0">⚠️</span>
                    <div>
                      No flows were extracted. Try editing the markdown — ensure section headers, tables, and API paths are clearly visible.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pipeline.draft.flows.map((flow, i) => (
                      <FlowCard key={i} flow={flow} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Approving */}
            {pipeline.step === "approving" && (
              <div className="flex items-center gap-3 text-sm text-emerald-700">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <div className="font-medium">Saving flows and APIs to database…</div>
              </div>
            )}

            {/* Done */}
            {pipeline.step === "done" && (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 text-sm text-emerald-700">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-1">Saved successfully</div>
                    <div className="text-emerald-600 text-xs flex gap-4 flex-wrap">
                      <span>{pipeline.flows} flow{pipeline.flows !== 1 ? "s" : ""}</span>
                      <span>{pipeline.apis} APIs</span>
                      <Link
                        href={`/documents/${pipeline.docId}`}
                        className="underline hover:text-emerald-800 flex items-center gap-1"
                      >
                        View document <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 transition-colors"
                >
                  Upload another
                </button>
              </div>
            )}

            {/* Error */}
            {pipeline.step === "error" && (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 text-sm text-red-700">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-1">Error</div>
                    <div className="text-red-600 text-xs font-mono break-all">{pipeline.message}</div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {pipeline.docId && (
                    <button
                      onClick={() => resumeExtraction(pipeline.docId!)}
                      className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Retry extraction
                    </button>
                  )}
                  <button
                    onClick={reset}
                    className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 transition-colors"
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-stone-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents yet. Upload one above.</p>
        </div>
      ) : (
        <div className="space-y-2.5 stagger-children">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="p-4 rounded-2xl border border-[#E4E8E0] bg-white hover:border-stone-300 hover:shadow-sm transition-all duration-200 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {doc.owner === "Monee" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium">
                      <User className="w-3 h-3" /> Monee
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-xs font-medium">
                      <Building2 className="w-3 h-3" /> Bank
                    </span>
                  )}
                  {doc.raw_format && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-mono uppercase">
                      {doc.raw_format}
                    </span>
                  )}
                  {doc.version && (
                    <span className="text-xs text-stone-400">v{doc.version}</span>
                  )}
                  {doc.pipeline_status && doc.pipeline_status !== "complete" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                      {doc.pipeline_status === "markdown_ready" || doc.pipeline_status === "file_ready"
                        ? "awaiting extraction"
                        : doc.pipeline_status === "pending_sheet_selection"
                        ? "select sheets"
                        : doc.pipeline_status === "extraction_review"
                        ? "pending approval"
                        : doc.pipeline_status}
                    </span>
                  )}
                </div>
                <div className="font-semibold text-stone-900 truncate text-[14px]">{doc.name}</div>
                {doc.partner_name && <div className="text-xs text-stone-500 mt-0.5">Partner: {doc.partner_name}</div>}
                {doc.flow_name && <div className="text-xs text-stone-400 mt-0.5">Flow: {doc.flow_name}</div>}
              </div>
              <div className="flex gap-1.5 shrink-0 flex-wrap">
                {doc.pipeline_status === "file_ready" && (
                  <button
                    onClick={() => resumeExtraction(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-indigo-200 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors font-medium"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Resume
                  </button>
                )}
                {doc.pipeline_status === "extraction_review" && (
                  <button
                    onClick={() => approveDoc(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-medium"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </button>
                )}
                <Link
                  href={`/documents/${doc.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:border-stone-300 hover:bg-stone-50 transition-colors font-medium"
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </Link>
                <a
                  href={api.exportPostman(doc.id)}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-300 hover:bg-stone-50 transition-colors font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> Postman
                </a>
                <a
                  href={api.exportOpenApi(doc.id)}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-300 hover:bg-stone-50 transition-colors font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> OpenAPI
                </a>
                <button
                  onClick={() => api.deleteDocument(doc.id).then(load)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
