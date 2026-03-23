"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, FileText, GitBranch, GitCompare, Menu, X } from "lucide-react";

const links = [
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/flows",     label: "Flows",     icon: GitBranch },
  { href: "/compare",   label: "Compare",   icon: GitCompare },
];

function SidebarInner({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <Link
        href="/"
        onClick={onNav}
        className="flex items-center gap-2.5 px-5 pt-7 pb-6 group"
      >
        {/* Double-bezel logo pill */}
        <div className="p-[3px] rounded-[10px] bg-indigo-100 border border-indigo-200/60">
          <div className="w-7 h-7 bg-indigo-600 rounded-[7px] flex items-center justify-center shadow-sm shadow-indigo-400/30 group-hover:scale-[1.04] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
            <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <span className="font-bold text-[#1A1A1A] tracking-[-0.02em] text-[15px]">unapi</span>
      </Link>

      {/* Section label */}
      <div className="px-5 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
          Workspace
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNav}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-stone-600 hover:bg-stone-100/80 hover:text-stone-900"
              }`}
            >
              <Icon
                className={`w-[15px] h-[15px] shrink-0 transition-colors ${
                  active ? "text-indigo-600" : "text-stone-400"
                }`}
                strokeWidth={active ? 2 : 1.75}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer badge */}
      <div className="px-5 py-5 border-t border-stone-100">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200/60">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-medium text-stone-500">API Intelligence</span>
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Desktop sidebar (fixed, 220px) ────────────────── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen w-[220px] bg-white border-r border-[#E8EAE4] flex-col z-40">
        <SidebarInner />
      </aside>

      {/* ── Mobile top bar ────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-[#E8EAE4] flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="p-[2px] rounded-[8px] bg-indigo-100 border border-indigo-200/60">
            <div className="w-6 h-6 bg-indigo-600 rounded-[6px] flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <span className="font-bold text-[#1A1A1A] tracking-[-0.02em] text-[14px]">unapi</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors duration-200"
          aria-label="Toggle menu"
        >
          <div className="relative w-4 h-4">
            <Menu
              className={`w-4 h-4 text-stone-600 absolute inset-0 transition-all duration-300 ${mobileOpen ? "opacity-0 rotate-90" : "opacity-100 rotate-0"}`}
            />
            <X
              className={`w-4 h-4 text-stone-600 absolute inset-0 transition-all duration-300 ${mobileOpen ? "opacity-100 rotate-0" : "opacity-0 -rotate-90"}`}
            />
          </div>
        </button>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────── */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          mobileOpen ? "visible" : "invisible"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        {/* Drawer panel */}
        <div
          className={`absolute top-0 left-0 h-full w-[220px] bg-white shadow-2xl shadow-black/10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarInner onNav={() => setMobileOpen(false)} />
        </div>
      </div>
    </>
  );
}
