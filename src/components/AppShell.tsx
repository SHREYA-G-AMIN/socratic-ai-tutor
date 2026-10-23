"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar, NAV_ITEMS, renderNavIcon } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar (fixed width, full height) */}
      <Sidebar className="hidden md:flex h-full" />

      {/* Main workspace container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent-primary font-bold text-sm shadow-xs">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-text-primary tracking-tight leading-none">
                SocraticAI
              </span>
              <span className="text-[10px] text-text-muted mt-0.5 leading-none">
                Tutor Studio
              </span>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="w-9 h-9 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary flex items-center justify-center transition-colors"
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col">
          {children}
        </main>
      </div>

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-surface border-r border-border z-50 transition-transform duration-200 ease-in-out md:hidden flex flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-4.5 flex items-center justify-between border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent-primary font-bold text-sm shadow-xs">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-text-primary tracking-tight leading-none">
                SocraticAI
              </span>
              <span className="text-[10px] text-text-muted mt-0.5 leading-none">
                Tutor Studio
              </span>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            aria-label="Close navigation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === "home" && pathname === "/";
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={closeSidebar}
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

        <div className="p-4 border-t border-border mt-auto flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-primary">Theme</span>
            <span className="text-[11px] text-text-muted">Appearance mode</span>
          </div>
          <ThemeToggle />
        </div>
      </aside>
    </div>
  );
}