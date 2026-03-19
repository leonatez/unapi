"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil, X, Plus, Loader2, ArrowRight, Link2, Link2Off } from "lucide-react";
import { api, Flow, FlowStep, ApiDef } from "@/lib/api/client";
import MermaidDiagram from "@/components/flow/MermaidDiagram";
import ApiSpecPanel from "@/components/api-spec/ApiSpecPanel";

// ─── Tiny input primitive ──────────────────────────────────────
function Inp({ value, onChange, placeholder = "", className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors ${className}`}
    />
  );
}

export default function FlowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [mermaid, setMermaid] = useState<string>("");
  const [selectedStep, setSelectedStep] = useState<FlowStep | null>(null);
  const [selectedApi, setSelectedApi] = useState<ApiDef | null>(null);
  const [loadingApi, setLoadingApi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingFlowName, setEditingFlowName] = useState(false);
  const [flowNameDraft, setFlowNameDraft] = useState("");
  const [flowDescDraft, setFlowDescDraft] = useState("");
  const [savingFlow, setSavingFlow] = useState(false);
  const [addingStep, setAddingStep] = useState(false);

  const refresh = async () => {
    const [f, m] = await Promise.all([api.getFlow(id), api.getFlowMermaid(id)]);
    setFlow(f);
    setMermaid(m.mermaid);
  };

  useEffect(() => {
    refresh().then(() => setLoading(false));
  }, [id]);

  const selectStep = async (step: FlowStep) => {
    setSelectedStep(step);
    setSelectedApi(null);
    if (step.api_id) {
      setLoadingApi(true);
      try {
        const fullApi = await api.getApi(step.api_id);
        setSelectedApi(fullApi);
      } finally {
        setLoadingApi(false);
      }
    }
  };

  const handleMermaidClick = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || !flow?.flow_step) return;
    const step = flow.flow_step.find(
      (s) => s.label && (
        s.label.toLowerCase().includes(trimmed.toLowerCase()) ||
        trimmed.toLowerCase().includes(s.label.toLowerCase())
      )
    );
    if (step) selectStep(step);
  };

  const saveFlowName = async () => {
    if (!flow) return;
    setSavingFlow(true);
    try {
      await api.updateFlow(flow.id, {
        name: flowNameDraft || flow.name,
        description: flowDescDraft || undefined,
      });
      setEditingFlowName(false);
      refresh();
    } finally {
      setSavingFlow(false);
    }
  };

  const sortedSteps = [...(flow?.flow_step ?? [])].sort((a, b) => a.step_order - b.step_order);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (!flow) return <div className="p-10 text-red-400">Flow not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-3.5 flex items-center gap-4 shrink-0">
        {editingFlowName ? (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <Inp value={flowNameDraft} onChange={setFlowNameDraft} placeholder="Flow name" className="w-64" />
            <Inp value={flowDescDraft} onChange={setFlowDescDraft} placeholder="Description (optional)" className="flex-1 min-w-48" />
            <button
              onClick={saveFlowName}
              disabled={savingFlow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 font-medium"
            >
              {savingFlow ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save
            </button>
            <button
              onClick={() => setEditingFlowName(false)}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-white truncate">{flow.name}</h1>
              {flow.description && <p className="text-sm text-gray-500 truncate">{flow.description}</p>}
            </div>
            <button
              onClick={() => { setFlowNameDraft(flow.name); setFlowDescDraft(flow.description ?? ""); setEditingFlowName(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white hover:bg-gray-800 shrink-0 transition-colors font-medium"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Diagram + step list */}
        <div className="flex flex-col w-[55%] border-r border-gray-800 overflow-y-auto">
          {/* Diagram */}
          <div className="p-4 border-b border-gray-800 shrink-0">
            {mermaid ? (
              <MermaidDiagram chart={mermaid} onStepClick={handleMermaidClick} />
            ) : (
              <p className="text-gray-700 text-sm py-4 text-center">No diagram</p>
            )}
          </div>

          {/* Step list */}
          <div className="p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Steps <span className="text-gray-700">({sortedSteps.length})</span>
              </div>
              <button
                onClick={() => setAddingStep(true)}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add step
              </button>
            </div>

            <div className="space-y-1">
              {sortedSteps.map((step) => (
                <StepRow
                  key={step.id}
                  step={step}
                  flowId={flow.id}
                  isSelected={selectedStep?.id === step.id}
                  onSelect={() => selectStep(step)}
                  onChanged={() => { refresh(); setSelectedStep(null); setSelectedApi(null); }}
                />
              ))}
              {addingStep && (
                <AddStepRow
                  flowId={flow.id}
                  nextOrder={(sortedSteps[sortedSteps.length - 1]?.step_order ?? 0) + 1}
                  onSaved={() => { setAddingStep(false); refresh(); }}
                  onCancel={() => setAddingStep(false)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right: API spec or step info */}
        <div className="flex-1 overflow-y-auto">
          {!selectedStep ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-2">
              <ArrowRight className="w-8 h-8 opacity-20" />
              <span className="text-sm">Select a step to inspect</span>
            </div>
          ) : loadingApi ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading API…
            </div>
          ) : selectedApi ? (
            <div>
              <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-gray-800">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Step {selectedStep.step_order} · API</div>
                  <div className="font-semibold text-white">{selectedApi.name}</div>
                </div>
                <button
                  onClick={() => { setSelectedStep(null); setSelectedApi(null); }}
                  className="text-gray-500 hover:text-white p-1 rounded-md hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ApiSpecPanel api={selectedApi} />
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Step {selectedStep.step_order}
                </div>
                <button
                  onClick={() => setSelectedStep(null)}
                  className="text-gray-500 hover:text-white p-1 rounded-md hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-white font-semibold text-lg mb-2">{selectedStep.label}</div>
              {(selectedStep.actor_from || selectedStep.actor_to) && (
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-5">
                  <span>{selectedStep.actor_from}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-600" />
                  <span>{selectedStep.actor_to}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                <Link2Off className="w-3.5 h-3.5 shrink-0" />
                No API linked to this step. Edit the step to link one.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step row with inline editing ─────────────────────────────

function StepRow({ step, flowId, isSelected, onSelect, onChanged }: {
  step: FlowStep; flowId: string; isSelected: boolean;
  onSelect: () => void; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    label: step.label ?? "",
    actor_from: step.actor_from ?? "",
    actor_to: step.actor_to ?? "",
    step_order: String(step.step_order),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateStep(flowId, step.id, {
        label: form.label || undefined,
        actor_from: form.actor_from || undefined,
        actor_to: form.actor_to || undefined,
        step_order: form.step_order ? parseInt(form.step_order) : undefined,
      });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm(`Delete step "${step.label}"?`)) return;
    await api.deleteStep(flowId, step.id);
    onChanged();
  };

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (editing) {
    return (
      <div className="p-3 rounded-xl border border-indigo-700 bg-gray-900 space-y-2">
        <div className="flex gap-2 flex-wrap">
          <div>
            <div className="text-xs text-gray-500 mb-1">#</div>
            <Inp value={form.step_order} onChange={set("step_order")} className="w-12" />
          </div>
          <div className="flex-1 min-w-40">
            <div className="text-xs text-gray-500 mb-1">Label</div>
            <Inp value={form.label} onChange={set("label")} className="w-full" placeholder="Step label" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">From</div>
            <Inp value={form.actor_from} onChange={set("actor_from")} className="w-full" placeholder="e.g. Monee" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">To</div>
            <Inp value={form.actor_to} onChange={set("actor_to")} className="w-full" placeholder="e.g. Bank" />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 font-medium"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-2.5 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border transition-all flex items-start gap-3 ${
      isSelected
        ? "bg-indigo-950/50 border-indigo-700"
        : "bg-gray-900 border-gray-800 hover:border-gray-700"
    }`}>
      <button onClick={onSelect} className="flex-1 flex items-start gap-3 px-3 py-2.5 min-w-0 text-left">
        <span className="text-gray-600 font-mono text-xs mt-0.5 shrink-0 w-5 text-right">{step.step_order}.</span>
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-sm truncate ${isSelected ? "text-white" : "text-gray-300"}`}>
            {step.label}
          </div>
          {(step.actor_from || step.actor_to) && (
            <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
              <span>{step.actor_from}</span>
              <ArrowRight className="w-3 h-3" />
              <span>{step.actor_to}</span>
            </div>
          )}
        </div>
        {step.api_id
          ? <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" title="API linked" />
          : <Link2Off className="w-3.5 h-3.5 text-gray-700 shrink-0 mt-0.5" title="No API" />
        }
      </button>
      <div className="shrink-0 flex gap-0.5 pr-2 pt-2.5">
        <button
          onClick={() => setEditing(true)}
          title="Edit"
          className="p-1 rounded text-gray-600 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={del}
          title="Delete"
          className="p-1 rounded text-gray-700 hover:text-red-400 hover:bg-gray-800 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function AddStepRow({ flowId, nextOrder, onSaved, onCancel }: {
  flowId: string; nextOrder: number; onSaved: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({ label: "", actor_from: "", actor_to: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.label) return;
    setSaving(true);
    try {
      await api.createStep(flowId, {
        label: form.label,
        actor_from: form.actor_from || undefined,
        actor_to: form.actor_to || undefined,
        step_order: nextOrder,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-3 rounded-xl border border-indigo-700 bg-indigo-950/20 space-y-2">
      <div className="flex gap-2 flex-wrap">
        <Inp value={form.label} onChange={set("label")} placeholder="Label *" className="flex-1 min-w-40" />
        <Inp value={form.actor_from} onChange={set("actor_from")} placeholder="From" className="w-28" />
        <Inp value={form.actor_to} onChange={set("actor_to")} placeholder="To" className="w-28" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 font-medium"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-2.5 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
