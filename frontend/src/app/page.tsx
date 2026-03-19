import Link from "next/link";
import { Upload, GitBranch, GitCompare, ArrowRight, Zap, FileSearch, Shield } from "lucide-react";

const features = [
  {
    icon: FileSearch,
    title: "Parse",
    desc: "DOCX, XLSX (40+ sheets), Markdown, PDF — extracted with LLM intelligence",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    icon: Zap,
    title: "Normalize",
    desc: "Canonical schema — fields, errors, security profiles, edge cases",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
  },
  {
    icon: Shield,
    title: "Diff",
    desc: "Breaking 🚨 · Risky ⚠️ · Info ℹ️ diffs between internal and partner specs",
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
  },
];

const ctas = [
  {
    href: "/documents",
    label: "Upload Document",
    icon: Upload,
    primary: true,
  },
  {
    href: "/flows",
    label: "View Flows",
    icon: GitBranch,
    primary: false,
  },
  {
    href: "/compare",
    label: "Compare Docs",
    icon: GitCompare,
    primary: false,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-6 text-center">
      {/* Badge */}
      <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
        <Zap className="w-3 h-3" />
        API Contract Intelligence Platform
      </div>

      {/* Hero */}
      <h1 className="text-5xl sm:text-6xl font-bold text-white mb-4 tracking-tight">
        unapi
      </h1>
      <p className="text-lg text-gray-400 mb-10 max-w-md leading-relaxed">
        Upload API docs, normalize them into a canonical schema, compare internal vs partner versions, and visualize integration flows.
      </p>

      {/* CTAs */}
      <div className="flex gap-3 flex-wrap justify-center mb-16">
        {ctas.map(({ href, label, icon: Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              primary
                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
                : "border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white hover:bg-gray-800"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {primary && <ArrowRight className="w-3.5 h-3.5" />}
          </Link>
        ))}
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full text-left">
        {features.map(({ icon: Icon, title, desc, color, bg, border }) => (
          <div
            key={title}
            className={`p-5 rounded-xl border ${border} ${bg} group hover:scale-[1.02] transition-transform`}
          >
            <div className={`${bg} ${border} border rounded-lg w-9 h-9 flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} />
            </div>
            <div className={`font-semibold mb-1 ${color}`}>{title}</div>
            <div className="text-sm text-gray-400 leading-relaxed">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
