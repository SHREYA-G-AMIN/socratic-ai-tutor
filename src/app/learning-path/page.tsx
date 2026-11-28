"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getLearningDashboardSummary,
  type DashboardConversation,
  type DashboardDocument,
  type LearningActivity,
} from "@/lib/learning-dashboard";

interface LearningPathResponse {
  conversations?: DashboardConversation[];
  error?: string;
}

interface DocumentsResponse {
  documents?: DashboardDocument[];
  error?: string;
}

interface DashboardData {
  conversations: DashboardConversation[];
  documents: DashboardDocument[];
}

export default function LearningPathPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const retry = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setData(await fetchDashboardData());
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void fetchDashboardData()
      .then((loadedData) => {
        if (active) {
          setData(loadedData);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(getErrorMessage(cause));
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

  const summary = useMemo(
    () =>
      data
        ? getLearningDashboardSummary(data.documents, data.conversations)
        : null,
    [data],
  );

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">
              Your study overview
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Learning Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
              A snapshot of the material you have saved and the tutoring
              conversations recorded in your account.
            </p>
          </div>
          <Link
            href="/my-documents"
            className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-hover"
          >
            Browse documents
          </Link>
        </header>

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void retry()}
              className="rounded-lg border border-error-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-hover"
            >
              Try again
            </button>
          </div>
        )}

        {loading && !data ? (
          <div
            aria-label="Loading your learning dashboard"
            aria-busy="true"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <span className="sr-only">Loading your saved learning activity…</span>
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-2xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : summary ? (
          <>
            <section
              aria-label="Learning totals"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <MetricCard
                label="Documents"
                value={summary.documentCount}
                detail="Saved in your library"
                accent="primary"
              />
              <MetricCard
                label="Study sessions"
                value={summary.conversationCount}
                detail="Recorded conversations"
                accent="secondary"
              />
              <MetricCard
                label="Student prompts"
                value={summary.studentPromptCount}
                detail="Messages saved in those sessions"
                accent="hint"
              />
              <MetricCard
                label="Documents studied"
                value={summary.documentsStudiedCount}
                detail="Linked to a tutoring session"
                accent="success"
              />
            </section>

            {summary.documentCount === 0 && summary.conversationCount === 0 ? (
              <section className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center shadow-sm sm:p-12">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface-elevated text-accent-primary">
                  <DocumentIcon />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-text-primary">
                  Your learning overview starts with your material
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
                  Upload a course PDF and ask the tutor questions. Your saved
                  documents and study activity will appear here.
                </p>
                <Link
                  href="/#upload-course-material"
                  className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-primary-hover"
                >
                  Upload course material
                </Link>
              </section>
            ) : (
              <div className="grid gap-5 xl:grid-cols-5">
                <section
                  aria-labelledby="recent-documents-heading"
                  className="rounded-2xl border border-border bg-surface p-5 shadow-sm xl:col-span-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2
                        id="recent-documents-heading"
                        className="font-semibold text-text-primary"
                      >
                        Recently studied documents
                      </h2>
                      <p className="mt-1 text-xs text-text-muted">
                        Ordered by the latest saved conversation for each document.
                      </p>
                    </div>
                    <Link
                      href="/my-documents"
                      className="text-xs font-semibold text-accent-primary hover:underline"
                    >
                      View library
                    </Link>
                  </div>

                  {summary.recentlyStudiedDocuments.length > 0 ? (
                    <ul className="mt-4 divide-y divide-border">
                      {summary.recentlyStudiedDocuments.map((item) => (
                        <li
                          key={item.document.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent-primary/15 bg-accent-primary-soft text-[10px] font-bold text-accent-primary">
                              PDF
                            </span>
                            <div className="min-w-0">
                              <p
                                className="truncate text-sm font-semibold text-text-primary"
                                title={item.document.file_name}
                              >
                                {item.document.file_name}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                {item.document.page_count === null
                                  ? "Page count unavailable"
                                  : `${item.document.page_count} ${item.document.page_count === 1 ? "page" : "pages"}`}
                                {" · "}
                                Studied {formatDate(item.lastStudiedAt)}
                              </p>
                            </div>
                          </div>
                          <Link
                            href={`/?conversationId=${encodeURIComponent(item.conversationId)}`}
                            className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-semibold text-accent-primary transition-colors hover:bg-accent-primary-soft/40"
                          >
                            Continue
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-5 rounded-xl border border-dashed border-border bg-surface-elevated/40 p-5 text-sm text-text-secondary">
                      No saved tutoring session is linked to a document yet.
                    </p>
                  )}
                </section>

                <section
                  aria-labelledby="recent-activity-heading"
                  className="rounded-2xl border border-border bg-surface p-5 shadow-sm xl:col-span-2"
                >
                  <h2
                    id="recent-activity-heading"
                    className="font-semibold text-text-primary"
                  >
                    Recent activity
                  </h2>
                  <p className="mt-1 text-xs text-text-muted">
                    Based on saved document and conversation timestamps.
                  </p>

                  {summary.recentActivity.length > 0 ? (
                    <ol className="mt-4 space-y-4">
                      {summary.recentActivity.map((activity, index) => (
                        <ActivityItem
                          key={activity.id}
                          activity={activity}
                          isLast={index === summary.recentActivity.length - 1}
                        />
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-5 text-sm text-text-secondary">
                      No recent learning activity is available yet.
                    </p>
                  )}
                </section>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: number;
  detail: string;
  accent: "primary" | "secondary" | "hint" | "success";
}) {
  const accentClasses = {
    primary: "bg-accent-primary",
    secondary: "bg-accent-secondary",
    hint: "bg-hint-text",
    success: "bg-success",
  };

  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${accentClasses[accent]}`}
      />
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-text-secondary">{detail}</p>
    </article>
  );
}

function ActivityItem({
  activity,
  isLast,
}: {
  activity: LearningActivity;
  isLast: boolean;
}) {
  const href = activity.conversationId
    ? `/?conversationId=${encodeURIComponent(activity.conversationId)}`
    : activity.documentId
      ? `/?documentId=${encodeURIComponent(activity.documentId)}`
      : "/learning-path";
  const action = activity.kind === "study" ? "Open session" : "Open document";

  return (
    <li className="relative flex gap-3">
      <span
        aria-hidden="true"
        className={`relative mt-1.5 grid h-3 w-3 shrink-0 place-items-center rounded-full border-2 border-accent-primary bg-surface ${
          isLast
            ? ""
            : "after:absolute after:left-1/2 after:top-2.5 after:h-12 after:w-px after:-translate-x-1/2 after:bg-border"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-text-primary">
              {activity.title}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">{activity.detail}</p>
          </div>
          <time
            dateTime={activity.occurredAt}
            className="shrink-0 text-[11px] text-text-muted"
          >
            {formatDateTime(activity.occurredAt)}
          </time>
        </div>
        <Link
          href={href}
          className="mt-1 inline-flex min-h-7 items-center text-xs font-semibold text-accent-primary hover:underline"
        >
          {action}
        </Link>
      </div>
    </li>
  );
}

function DocumentIcon() {
  return (
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
  );
}

async function fetchDashboardData(): Promise<DashboardData> {
  const [conversationResponse, documentResponse] = await Promise.all([
    fetch("/api/learning-path", { cache: "no-store" }),
    fetch("/api/documents", { cache: "no-store" }),
  ]);
  const [conversationBody, documentBody] = await Promise.all([
    conversationResponse.json() as Promise<LearningPathResponse>,
    documentResponse.json() as Promise<DocumentsResponse>,
  ]);

  if (!conversationResponse.ok) {
    throw new Error(
      conversationBody.error || "Could not load your learning activity.",
    );
  }
  if (!documentResponse.ok) {
    throw new Error(documentBody.error || "Could not load your documents.");
  }

  return {
    conversations: conversationBody.conversations ?? [],
    documents: documentBody.documents ?? [],
  };
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Could not load your learning dashboard. Please try again.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
