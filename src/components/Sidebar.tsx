"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/", label: "My Documents", icon: "documents" },
  { href: "/", label: "Learning Path", icon: "path" },
  { href: "/", label: "Chat", icon: "chat" },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col w-60 bg-surface border-r border-border shrink-0 z-20 ${className ?? ""}`}
    >
      <div className="p-6 flex items-center gap-3 mb-12 border-b border-border pb-6">
        <div className="w-10 h-10 rounded-lg bg-accent-primary flex items-center justify-center text-text-on-accent font-semibold text-sm shadow-sm">
          S
        </div>
        <span className="text-lg font-bold text-primary tracking-tight">SocraticAI</span>
      </div>

      <nav className="flex-1 px-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors border-l-2 ${
                isActive
                  ? "border-accent-primary bg-accent-primary-soft text-accent-primary"
                  : "border-transparent text-secondary hover:text-primary hover:bg-surface-hover"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="w-5 text-center">{renderIcon(item.icon)}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  );
}

function renderIcon(icon: string): React.ReactElement {
  switch (icon) {
    case "home":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "documents":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "path":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case "chat":
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