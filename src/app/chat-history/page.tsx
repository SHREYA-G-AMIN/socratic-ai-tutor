"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Conversation {
  id: string;
  title: string;
  document_id: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export default function ChatHistoryPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load chat history");
      setItems(body.conversations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load chat history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Could not delete conversation");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">Keep learning</p>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">Chat History</h1>
          <p className="mt-1 text-sm text-text-secondary">Continue a previous Socratic session with its document and messages.</p>
        </header>
        {error && <p role="alert" className="rounded-xl border border-error-border bg-error-bg p-3 text-sm text-error-text">{error}</p>}
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-text-muted">Loading conversations…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
            <h2 className="font-semibold text-text-primary">No conversations yet</h2>
            <p className="mt-1 text-sm text-text-secondary">Your tutoring sessions will appear here after you ask your first question.</p>
            <Link href="/" className="mt-5 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-hover">Start learning</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-text-primary">{item.title}</h2>
                  <p className="mt-1 text-xs text-text-muted">{item.message_count} messages · Updated {new Date(item.updated_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-4">
                  <Link href={`/?conversationId=${encodeURIComponent(item.id)}`} className="text-sm font-semibold text-accent-primary hover:underline">Resume →</Link>
                  <button type="button" onClick={() => void remove(item.id)} className="text-xs font-medium text-error-text hover:underline">Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
