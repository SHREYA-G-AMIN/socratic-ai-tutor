"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface SavedDocument {
  id: string;
  file_name: string;
  file_size_bytes: number;
  page_count: number | null;
  character_count: number;
  ocr_used: boolean;
  created_at: string;
}

export default function MyDocumentsPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load documents");
      setDocuments(body.documents ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  async function removeDocument(id: string) {
    if (!window.confirm("Delete this saved document? Its linked conversations will remain, but the document can no longer be opened.")) return;
    const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Could not delete document");
      return;
    }
    setDocuments((current) => current.filter((document) => document.id !== id));
  }

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">Your library</p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">My Documents</h1>
            <p className="mt-1 text-sm text-text-secondary">Your saved course material, ready to continue studying.</p>
          </div>
          <Link href="/" className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-primary-hover">Upload a document</Link>
        </header>

        {error && <p role="alert" className="rounded-xl border border-error-border bg-error-bg p-3 text-sm text-error-text">{error}</p>}
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-text-muted">Loading your documents…</div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-surface-elevated text-accent-primary">PDF</div>
            <h2 className="mt-4 font-semibold text-text-primary">Your library is empty</h2>
            <p className="mt-1 text-sm text-text-secondary">Upload a syllabus, textbook, or lecture notes from Home. It will be saved to your account.</p>
            <Link href="/" className="mt-5 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-hover">Go to tutor workspace</Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {documents.map((document) => (
              <article key={document.id} className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-elevated text-xs font-bold text-accent-primary">PDF</div>
                  {document.ocr_used && <span className="rounded-full bg-success-bg px-2.5 py-1 text-[10px] font-semibold text-success-text">OCR processed</span>}
                </div>
                <h2 className="mt-4 truncate font-semibold text-text-primary" title={document.file_name}>{document.file_name}</h2>
                <p className="mt-1 text-xs text-text-muted">{document.page_count ?? "—"} pages · {(document.character_count ?? 0).toLocaleString()} characters · {(document.file_size_bytes / 1048576).toFixed(1)} MB</p>
                <p className="mt-2 text-[11px] text-text-muted">Added {new Date(document.created_at).toLocaleDateString()}</p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <Link href={`/?documentId=${encodeURIComponent(document.id)}`} className="text-sm font-semibold text-accent-primary hover:underline">Open in tutor →</Link>
                  <button type="button" onClick={() => void removeDocument(document.id)} className="text-xs font-medium text-error-text hover:underline">Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
