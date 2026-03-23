import Link from "next/link";
import { Upload, GitBranch, GitCompare, ArrowRight, Zap, FileSearch, Shield } from "lucide-react";

const features = [
  {
    icon: FileSearch,
    title: "Parse",
    desc: "DOCX, XLSX (40+ sheets), Markdown, PDF — extracted with LLM intelligence",
    cardBg:    "#EBF4FF",
    cardBorder: "#C3D9F8",
    iconBg:    "#DBEAFE",
    iconColor: "#2563EB",
    titleColor:"#1E40AF",
  },
  {
    icon: Zap,
    title: "Normalize",
    desc: "Canonical schema — fields, errors, security profiles, edge cases",
    cardBg:    "#F3F0FF",
    cardBorder: "#DDD5F8",
    iconBg:    "#EDE9FE",
    iconColor: "#7C3AED",
    titleColor:"#5B21B6",
  },
  {
    icon: Shield,
    title: "Diff",
    desc: "Breaking · Risky · Info diffs between internal and partner specs",
    cardBg:    "#EDFAF0",
    cardBorder: "#BBF0CB",
    iconBg:    "#D1FAE5",
    iconColor: "#059669",
    titleColor:"#065F46",
  },
];

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-24 text-center">
      {/* Eyebrow badge */}
      <div className="animate-fade-up mb-8 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E4E8E0] text-stone-600 text-[11px] font-medium tracking-wide shadow-sm">
        <Zap className="w-3 h-3 text-indigo-500" strokeWidth={2.5} />
        API Contract Intelligence Platform
      </div>

      {/* Hero heading */}
      <h1
        className="animate-fade-up text-[72px] sm:text-[88px] font-bold text-[#1A1A1A] mb-4 tracking-[-0.04em] leading-[1]"
        style={{ animationDelay: "60ms" }}
      >
        unapi
      </h1>
      <p
        className="animate-fade-up text-[16px] text-stone-500 mb-12 max-w-[380px] leading-relaxed"
        style={{ animationDelay: "120ms" }}
      >
        Upload API docs, normalize them into a canonical schema, compare
        internal vs partner versions, and visualize integration flows.
      </p>

      {/* CTAs */}
      <div
        className="animate-fade-up flex gap-2.5 flex-wrap justify-center mb-20"
        style={{ animationDelay: "180ms" }}
      >
        {/* Primary CTA — Button-in-Button pattern */}
        <Link
          href="/documents"
          className="group flex items-center gap-2 pl-5 pr-2 py-2 rounded-full font-medium text-[13px] bg-indigo-600 hover:bg-indigo-700 text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-sm shadow-indigo-200 active:scale-[0.98]"
        >
          <Upload className="w-3.5 h-3.5 shrink-0" />
          Upload Document
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center ml-0.5 group-hover:translate-x-0.5 group-hover:-translate-y-px transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
            <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        <Link
          href="/flows"
          className="flex items-center gap-2 px-5 py-2 rounded-full font-medium text-[13px] bg-white border border-[#E4E8E0] text-stone-700 hover:border-stone-300 hover:bg-stone-50 transition-all duration-300 shadow-sm active:scale-[0.98]"
        >
          <GitBranch className="w-3.5 h-3.5 text-stone-400" />
          View Flows
        </Link>

        <Link
          href="/compare"
          className="flex items-center gap-2 px-5 py-2 rounded-full font-medium text-[13px] bg-white border border-[#E4E8E0] text-stone-700 hover:border-stone-300 hover:bg-stone-50 transition-all duration-300 shadow-sm active:scale-[0.98]"
        >
          <GitCompare className="w-3.5 h-3.5 text-stone-400" />
          Compare Docs
        </Link>
      </div>

      {/* Feature cards — Double-Bezel bento */}
      <div
        className="animate-fade-up grid grid-cols-1 md:grid-cols-3 gap-3.5 max-w-[680px] w-full text-left stagger-children"
        style={{ animationDelay: "240ms" }}
      >
        {features.map(({ icon: Icon, title, desc, cardBg, cardBorder, iconBg, iconColor, titleColor }) => (
          <div
            key={title}
            className="p-[5px] rounded-[1.5rem] border"
            style={{ background: cardBg, borderColor: cardBorder }}
          >
            {/* Inner core */}
            <div className="bg-white/75 rounded-[calc(1.5rem-5px)] p-5 h-full flex flex-col gap-3">
              {/* Icon in nested circle */}
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: iconBg }}
              >
                <Icon className="w-[17px] h-[17px]" style={{ color: iconColor }} strokeWidth={1.75} />
              </div>
              <div>
                <div className="text-[13px] font-semibold mb-1" style={{ color: titleColor }}>
                  {title}
                </div>
                <div className="text-[12px] text-stone-500 leading-relaxed">{desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
