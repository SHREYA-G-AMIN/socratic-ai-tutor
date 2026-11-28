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

interface DocumentListResponse {
  documents?: SavedDocument[];
  error?: string;
}

interface DocumentDeleteResponse {
  error?: string;
}

export default function MyDocumentsPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    try {
      setDocuments(await fetchDocuments());
      setError("");
    } catch (cause) {
      setError(getLoadErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void fetchDocuments()
      .then((loadedDocuments) => {
        if (active) {
          setDocuments(loadedDocuments);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(getLoadErrorMessage(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function removeDocument(document: SavedDocument) {
    if (
      !window.confirm(
        `Delete "${document.file_name}"? Its linked conversations will remain, but the document can no longer be opened.`,
      )
    ) {
      return;
    }

    setDeletingId(document.id);
    setError("");

    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(document.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => null)) as
        | DocumentDeleteResponse
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Could not delete this document.");
      }

      setDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete this document. Please try again.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function retryLoad() {
    setLoading(true);
    void loadDocuments();
  }

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">
              Your library
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              My Documents
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
              Your course material, ready when you are. Open a document to study
              with the tutor or add new material to your library.
            </p>
          </div>
          <Link
            href="/#upload-course-material"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-primary-hover"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v14m-7-7h14"
              />
            </svg>
            Upload a document
          </Link>
        </header>

        {error && documents.length > 0 && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="rounded-lg px-2 py-1 text-xs font-semibold hover:bg-error-text/10"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <section
            aria-label="Loading saved documents"
            aria-busy="true"
            className="grid gap-4 sm:grid-cols-2"
          >
            <span className="sr-only">Loading your saved documents…</span>
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-xl bg-surface-elevated" />
                  <div className="h-6 w-24 rounded-full bg-surface-elevated" />
                </div>
                <div className="mt-5 h-4 w-3/4 rounded bg-surface-elevated" />
                <div className="mt-3 h-3 w-1/2 rounded bg-surface-elevated" />
                <div className="mt-6 h-10 rounded-lg bg-surface-elevated" />
              </div>
            ))}
          </section>
        ) : error && documents.length === 0 ? (
          <section className="rounded-2xl border border-error-border bg-error-bg p-7 sm:p-9">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-error-text">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M12 9v3m0 4h.01M10.3 3.86 1.82 18.5A2 2 0 0 0 3.55 21h16.9a2 2 0 0 0 1.73-2.5L13.7 3.86a2 2 0 0 0-3.4 0Z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">
                  Your library couldn’t be loaded
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-error-text">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-error-border bg-surface px-3.5 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-hover"
                >
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : documents.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface-elevated text-accent-primary">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.7}
                  d="M7 3.75h6.586a1 1 0 0 1 .707.293l4.664 4.664a1 1 0 0 1 .293.707v10.836A1.75 1.75 0 0 1 17.5 22h-10A1.75 1.75 0 0 1 5.75 20.25V5.5A1.75 1.75 0 0 1 7.5 3.75Zm6.25.5v4.5h4.5M8.5 13h7m-7 3.5h7"
                />
              </svg>
            </div>
            <h2 className="mt-5 text-lg font-semibold text-text-primary">
              Your library is ready for its first document
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
              Add a syllabus, textbook chapter, or lecture notes. The tutor will
              use the saved material to guide your study.
            </p>
            <Link
              href="/#upload-course-material"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-primary-hover"
            >
              Upload your first PDF
            </Link>
          </section>
        ) : (
          <section aria-label="Saved documents">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-text-secondary">
                {documents.length}{" "}
                {documents.length === 1 ? "document" : "documents"}
              </p>
              <p className="text-xs text-text-muted">
                Select a document to open its study space
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {documents.map((document) => (
                <article
                  key={document.id}
                  className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent-primary/40 hover:shadow-md"
                >
                  <div
                    aria-hidden="true"
                    className="h-1 bg-gradient-to-r from-accent-primary/70 via-accent-primary to-accent-secondary/70"
                  />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent-primary/15 bg-accent-primary-soft text-[10px] font-bold tracking-wide text-accent-primary">
                          PDF
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-bg px-2.5 py-1 text-[11px] font-semibold text-success-text">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-success"
                            aria-hidden="true"
                          />
                          Ready to study
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeDocument(document)}
                        disabled={deletingId === document.id}
                        aria-label={`Delete ${document.file_name}`}
                        className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-error-bg hover:text-error-text disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === document.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>

                    <h2
                      className="mt-4 break-words text-base font-semibold leading-snug text-text-primary"
                      title={document.file_name}
                    >
                      {document.file_name}
                    </h2>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
                      <span>
                        {document.page_count === null
                          ? "Page count unavailable"
                          : `${document.page_count} ${document.page_count === 1 ? "page" : "pages"}`}
                      </span>
                      <span>
                        {(document.file_size_bytes / (1024 * 1024)).toFixed(1)}{" "}
                        MB
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-text-muted">
                      Added{" "}
                      <time dateTime={document.created_at}>
                        {formatUploadDate(document.created_at)}
                      </time>
                    </p>

                    {document.ocr_used && (
                      <p className="mt-3 inline-flex rounded-lg border border-info-border bg-info-bg px-2.5 py-1.5 text-[11px] font-medium text-info-text">
                        Scanned pages processed with OCR
                      </p>
                    )}

                    <div className="mt-5 border-t border-border pt-4">
                      <Link
                        href={`/?documentId=${encodeURIComponent(document.id)}`}
                        aria-label={`Open ${document.file_name} in tutor`}
                        className="inline-flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm font-semibold text-accent-primary transition-colors hover:bg-accent-primary-soft/50 group-hover:text-accent-primary-hover"
                      >
                        <span>Open in tutor</span>
                        <svg
                          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.8}
                            d="M5 12h14m-6-6 6 6-6 6"
                          />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function formatUploadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

async function fetchDocuments(): Promise<SavedDocument[]> {
  const response = await fetch("/api/documents", { cache: "no-store" });
  const body = (await response.json()) as DocumentListResponse;
  if (!response.ok) {
    throw new Error(body.error || "Could not load your documents.");
  }

  return body.documents ?? [];
}

function getLoadErrorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Could not load your documents. Please try again.";
}
