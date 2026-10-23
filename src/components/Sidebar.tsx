"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

export interface NavItemConfig {
  id: string;
  href: string;
  label: string;
  icon: "home" | "documents" | "path" | "chat";
}

export const NAV_ITEMS: NavItemConfig[] = [
  { id: "home", href: "/", label: "Home", icon: "home" },
  { id: "documents", href: "#documents", label: "My Documents", icon: "documents" },
  { id: "path", href: "#learning-path", label: "Learning Path", icon: "path" },
  { id: "chat", href: "#chat", label: "Chat", icon: "chat" },
];

export function renderNavIcon(icon: NavItemConfig["icon"]): React.ReactElement {
  switch (icon) {
    case "home":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      );
    case "documents":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case "path":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      );
    case "chat":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
  }
}

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col w-64 bg-surface border-r border-border shrink-0 z-20 ${
        className ?? ""
      }`}
    >
      {/* Brand header */}
      <div className="px-5 py-4.5 flex items-center gap-3 border-b border-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent-primary font-bold text-sm shadow-xs">
          S
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-text-primary tracking-tight leading-none">
            SocraticAI
          </span>
          <span className="text-[11px] text-text-muted mt-0.5 leading-none">
            Tutor Studio
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === "home" && pathname === "/";
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 ${
                isActive
                  ? "border-accent-primary bg-accent-primary-soft/50 text-accent-primary font-semibold"
                  : "border-transparent bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover/70"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {renderNavIcon(item.icon)}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border mt-auto flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-text-primary">Theme</span>
          <span className="text-[11px] text-text-muted">Appearance mode</span>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}