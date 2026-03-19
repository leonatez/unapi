import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
      <h1 className="text-5xl font-bold text-white mb-4">unapi</h1>
      <p className="text-xl text-gray-400 mb-2 max-w-lg">
        API Contract Intelligence Platform
      </p>
      <p className="text-gray-500 mb-10 max-w-md">
        Upload API docs, normalize them into a canonical schema, compare internal vs partner versions, and visualize integration flows.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        <Link
          href="/documents"
          className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          Upload Document
        </Link>
        <Link
          href="/flows"
          className="px-6 py-3 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 font-medium transition-colors"
        >
          View Flows
        </Link>
        <Link
          href="/compare"
          className="px-6 py-3 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 font-medium transition-colors"
        >
          Compare Docs
        </Link>
      </div>
      <div className="mt-16 grid grid-cols-3 gap-6 max-w-2xl text-left">
        {[
          { title: "Parse", desc: "DOCX, XLSX (40+ sheets), Markdown, PDF" },
          { title: "Normalize", desc: "Canonical schema — fields, errors, security, edge cases" },
          { title: "Diff", desc: "Breaking 🚨 · Risky ⚠️ · Info ℹ️ diffs between internal and partner" },
        ].map((f) => (
          <div key={f.title} className="p-4 rounded-lg border border-gray-800 bg-gray-900">
            <div className="font-semibold text-white mb-1">{f.title}</div>
            <div className="text-sm text-gray-400">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
