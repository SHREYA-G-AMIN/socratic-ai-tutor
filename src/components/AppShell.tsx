"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

const MOBILE_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/", label: "My Documents" },
  { href: "/", label: "Learning Path" },
  { href: "/", label: "Chat" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex flex-col h-screen bg-background">
      <header
        className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface z-20"
      >
        <h1 className="text-xl font-bold text-primary">SocraticAI</h1>
        <button
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="w-9 h-9 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
      </header>

      <div className="flex-1 relative min-h-0">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed left-0 top-0 h-full w-64 bg-surface border-r border-border z-50 transition-transform duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:hidden`}
        >
          <div className="p-4 flex items-center justify-between border-b border-border pb-3 mb-6">
            <span className="text-xl font-bold text-primary">SocraticAI</span>
            <button
              onClick={closeSidebar}
              className="w-8 h-8 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Close navigation"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <nav className="px-3 space-y-1">
            {MOBILE_NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-secondary hover:text-primary hover:bg-surface-hover transition-colors border-l-2 border-transparent hover:border-surface-tertiary"
                aria-current={item.href === "/" ? "page" : undefined}
              >
                <span className="w-5 text-muted">{renderIcon(item.label)}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </a>
            ))}
          </nav>
          <div className="p-3 border-t border-border mt-auto">
            <ThemeToggle />
          </div>
        </aside>

        <Sidebar className="hidden md:block" />

        <main className="md:pl-64 flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
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