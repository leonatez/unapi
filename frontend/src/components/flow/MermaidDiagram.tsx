"use client";
import { useEffect, useRef } from "react";

interface Props {
  chart: string;
  onStepClick?: (label: string) => void;
}

export default function MermaidDiagram({ chart, onStepClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !chart) return;
    let cancelled = false;

    import("mermaid").then((mod) => {
      if (cancelled) return;
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      mermaid.render(id, chart).then(({ svg }) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        // Wire up click handlers on sequence elements
        if (onStepClick) {
          ref.current.querySelectorAll("text").forEach((el) => {
            el.style.cursor = "pointer";
            el.addEventListener("click", () => onStepClick(el.textContent || ""));
          });
        }
      });
    });

    return () => { cancelled = true; };
  }, [chart, onStepClick]);

  return <div ref={ref} className="overflow-x-auto w-full" />;
}
