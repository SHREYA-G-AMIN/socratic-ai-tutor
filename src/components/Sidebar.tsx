"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/", label: "My Documents" },
  { href: "/", label: "Learning Path" },
  { href: "/", label: "Chat" },
];

export function Sidebar({ className }: { className?: string }) {

  return (
    <aside
      className={`flex flex-col w-64 bg-surface border-r border-border shrink-0 ${className ?? ""}`}
    >
      <div className="p-6 flex items-center gap-3 mb-10 border-b border-border pb-4">
        <div className="w-8 h-8 rounded-md bg-accent-primary flex items-center justify-center text-text-on-accent font-medium text-sm">
          S
        </div>
        <span className="text-xl font-bold text-primary tracking-tight">SocraticAI</span>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-secondary hover:text-primary hover:bg-surface-hover transition-colors border-l-2 border-transparent hover:border-surface-tertiary"
            aria-current={item.href === "/" ? "page" : undefined}
          >
            <span className="w-5 text-muted">{renderIcon(item.label)}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  );
}

function renderIcon(label: string): React.ReactElement {
  switch (label) {
    case "Home":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "My Documents":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "Learning Path":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case "Chat":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7" />
        </svg>
      );
  }
}