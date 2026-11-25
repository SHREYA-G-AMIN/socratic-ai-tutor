"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  messages: Array<{ role?: string; text?: string }>;
}

const STOP_WORDS = new Set(["about","after","again","also","because","could","does","from","have","help","into","just","more","please","that","their","there","these","they","this","what","when","where","which","with","would","your","explain","define","tell","give","make","show","understand"]);

export default function LearningPathPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/learning-path", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load learning progress");
      setConversations(body.conversations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load learning progress");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const studentMessages = conversations.flatMap((conversation) =>
    conversation.messages.filter((message) => message.role === "student" && message.text).map((message) => ({ ...message, conversation }))
  );
  const wordCounts = new Map<string, number>();
  for (const item of studentMessages) {
    for (const word of (item.text ?? "").toLowerCase().match(/[a-z]{5,}/g) ?? []) {
      if (!STOP_WORDS.has(word)) wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }
  const topics = [...wordCounts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">Your study overview</p>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">Learning Path</h1>
          <p className="mt-1 text-sm text-text-secondary">A view of what you've actually studied and revisited in your tutor sessions.</p>
        </header>
        {error && <p role="alert" className="rounded-xl border border-error-border bg-error-bg p-3 text-sm text-error-text">{error}</p>}
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-text-muted">Building your learning overview…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-surface p-5"><p className="text-xs text-text-muted">Study sessions</p><p className="mt-2 text-3xl font-semibold text-text-primary">{conversations.length}</p></div>
              <div className="rounded-2xl border border-border bg-surface p-5"><p className="text-xs text-text-muted">Questions asked</p><p className="mt-2 text-3xl font-semibold text-text-primary">{studentMessages.length}</p></div>
              <div className="rounded-2xl border border-border bg-surface p-5"><p className="text-xs text-text-muted">Topics revisited</p><p className="mt-2 text-3xl font-semibold text-text-primary">{topics.length}</p></div>
            </div>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-semibold text-text-primary">Frequently revisited terms</h2>
              <p className="mt-1 text-xs text-text-muted">Based on repeated words in your questions, not an AI-assigned mastery score.</p>
              {topics.length ? <div className="mt-4 flex flex-wrap gap-2">{topics.map(([word, count]) => <span key={word} className="rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-primary">{word} <span className="ml-1 text-text-muted">×{count}</span></span>)}</div> : <p className="mt-4 text-sm text-text-secondary">More sessions are needed before repeated topics can be identified.</p>}
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-semibold text-text-primary">Continue where you left off</h2>
              {conversations.length ? <div className="mt-3 space-y-3">{conversations.slice(0, 5).map((conversation) => <div key={conversation.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><div><p className="text-sm font-medium text-text-primary">{conversation.title}</p><p className="text-xs text-text-muted">{new Date(conversation.updated_at).toLocaleDateString()}</p></div><Link href={`/?conversationId=${encodeURIComponent(conversation.id)}`} className="text-sm font-semibold text-accent-primary hover:underline">Resume →</Link></div>)}</div> : <p className="mt-3 text-sm text-text-secondary">Your study path will build as you complete tutoring sessions.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
