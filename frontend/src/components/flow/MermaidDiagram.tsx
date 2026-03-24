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
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        securityLevel: "loose",
        themeVariables: {
          // Base
          background: "#ffffff",
          primaryColor: "#EEF2FF",
          primaryTextColor: "#1A1A1A",
          primaryBorderColor: "#C7D2FE",
          lineColor: "#A8A29E",
          secondaryColor: "#F5F5F4",
          tertiaryColor: "#ffffff",
          fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
          fontSize: "13px",
          // Sequence diagram
          actorBkg: "#EEF2FF",
          actorBorder: "#C7D2FE",
          actorTextColor: "#1A1A1A",
          actorLineColor: "#D6D3D1",
          signalColor: "#57534E",
          signalTextColor: "#1A1A1A",
          labelBoxBkgColor: "#ffffff",
          labelBoxBorderColor: "#E7E5E4",
          labelTextColor: "#57534E",
          loopTextColor: "#57534E",
          noteBorderColor: "#E7E5E4",
          noteBkgColor: "#FFFBEB",
          noteTextColor: "#78716C",
          activationBorderColor: "#6366F1",
          activationBkgColor: "#EEF2FF",
          // Flowchart nodes
          nodeBorder: "#C7D2FE",
          clusterBkg: "#F0F2EE",
          edgeLabelBackground: "#ffffff",
        },
      });

      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      mermaid.render(id, chart).then(({ svg }) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;

        // Round all sharp rects to match the app's rounded aesthetic
        ref.current.querySelectorAll("rect").forEach((el) => {
          const rx = el.getAttribute("rx");
          if (!rx || rx === "0") {
            el.setAttribute("rx", "8");
            el.setAttribute("ry", "8");
          }
        });

        // Apply Geist font to all text nodes
        ref.current.querySelectorAll("text, tspan").forEach((el) => {
          (el as SVGElement).style.fontFamily =
            "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";
          (el as SVGElement).style.fill = "#1A1A1A";
        });

        // Wire up click handlers
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

  return (
    <div
      ref={ref}
      className="overflow-x-auto w-full bg-white rounded-xl border border-stone-200 p-4 [&_svg]:max-w-full [&_svg]:rounded-xl"
    />
  );
}
