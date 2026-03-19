"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Flow, FlowStep, ApiDef } from "@/lib/api/client";
import MermaidDiagram from "@/components/flow/MermaidDiagram";
import ApiSpecPanel from "@/components/api-spec/ApiSpecPanel";

export default function FlowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [mermaid, setMermaid] = useState<string>("");
  const [selectedStep, setSelectedStep] = useState<FlowStep | null>(null);
  const [selectedApi, setSelectedApi] = useState<ApiDef | null>(null);
  const [loadingApi, setLoadingApi] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getFlow(id), api.getFlowMermaid(id)]).then(([f, m]) => {
      setFlow(f);
      setMermaid(m.mermaid);
      setLoading(false);
    });
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

  // Mermaid text click: fuzzy-match against step labels
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

  const sortedSteps = [...(flow?.flow_step ?? [])].sort((a, b) => a.step_order - b.step_order);

  if (loading) return <div className="p-10 text-gray-500">Loading…</div>;
  if (!flow) return <div className="p-10 text-red-400">Flow not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-53px)]">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold text-white">{flow.name}</h1>
        {flow.description && <p className="text-sm text-gray-400 max-w-xl truncate">{flow.description}</p>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Mermaid + step list */}
        <div className="flex flex-col w-[55%] border-r border-gray-800 overflow-y-auto">
          {/* Mermaid diagram */}
          <div className="p-4 border-b border-gray-800">
            {mermaid ? (
              <MermaidDiagram chart={mermaid} onStepClick={handleMermaidClick} />
            ) : (
              <p className="text-gray-500 text-sm">No diagram available</p>
            )}
          </div>

          {/* Step list */}
          <div className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Steps — click to inspect</div>
            <div className="space-y-1">
              {sortedSteps.map((step) => {
                const isSelected = selectedStep?.id === step.id;
                const hasApi = !!step.api_id;
                return (
                  <button
                    key={step.id}
                    onClick={() => selectStep(step)}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-start gap-3
                      ${isSelected
                        ? "bg-indigo-900 border border-indigo-600 text-white"
                        : "bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-600 hover:text-white"
                      }`}
                  >
                    <span className="text-gray-500 font-mono text-xs mt-0.5 shrink-0 w-5 text-right">{step.step_order}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{step.label}</div>
                      {(step.actor_from || step.actor_to) && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {step.actor_from} → {step.actor_to}
                        </div>
                      )}
                    </div>
                    {hasApi ? (
                      <span className="text-xs text-indigo-400 shrink-0 mt-0.5">API ▶</span>
                    ) : (
                      <span className="text-xs text-gray-700 shrink-0 mt-0.5">no API</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: API spec or step info */}
        <div className="flex-1 overflow-y-auto">
          {!selectedStep ? (
            <div className="flex items-center justify-center h-full text-gray-700 text-sm">
              Select a step on the left to inspect
            </div>
          ) : loadingApi ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm gap-2">
              <span className="animate-spin">⏳</span> Loading API spec…
            </div>
          ) : selectedApi ? (
            <div>
              <div className="flex items-center justify-between px-6 pt-4 pb-2 border-b border-gray-800">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Step {selectedStep.step_order} · API Specification</div>
                  <div className="font-semibold text-white">{selectedApi.name}</div>
                </div>
                <button onClick={() => { setSelectedStep(null); setSelectedApi(null); }}
                  className="text-gray-500 hover:text-white text-sm">✕</button>
              </div>
              <ApiSpecPanel api={selectedApi} />
            </div>
          ) : (
            /* Step selected but no linked API */
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Step {selectedStep.step_order}</div>
                <button onClick={() => setSelectedStep(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
              </div>
              <div className="text-white font-semibold text-lg mb-2">{selectedStep.label}</div>
              {(selectedStep.actor_from || selectedStep.actor_to) && (
                <div className="text-sm text-gray-400 mb-4">
                  {selectedStep.actor_from} → {selectedStep.actor_to}
                </div>
              )}
              <div className="text-xs text-gray-600 bg-gray-900 border border-gray-800 rounded px-4 py-3">
                No API is linked to this step. The LLM could not match a step label to an extracted API name during parsing.
                If an API exists in the document, you can find it under the Documents tab.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
