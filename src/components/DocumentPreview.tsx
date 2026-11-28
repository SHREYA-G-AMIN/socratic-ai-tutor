"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentUploadSuccessData } from "@/types/document";
import type { ChatSourceReference } from "@/types/chat";

export interface DocumentPreviewProps {
  document: DocumentUploadSuccessData;
  onReset?: () => void;
  sourceReferences?: ChatSourceReference[] | null;
  selectedSourceIndex?: number;
  onSourceIndexChange?: (index: number) => void;
  onCloseSourceExplorer?: () => void;
}

export function DocumentPreview({
  document,
  onReset,
  sourceReferences,
  selectedSourceIndex = 0,
  onSourceIndexChange,
  onCloseSourceExplorer,
}: DocumentPreviewProps) {
  const [copied, setCopied] = useState(false);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const sourceMarkerRef = useRef<HTMLElement>(null);
  const selectedSource = sourceReferences?.[selectedSourceIndex] ?? null;

  useEffect(() => {
    if (!selectedSource) return;

    const frame = window.requestAnimationFrame(() => {
      const container = textContainerRef.current;
      const marker = sourceMarkerRef.current;
      if (!container || !marker) return;

      const markerTop =
        marker.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      container.scrollTo({
        top: Math.max(0, markerTop - container.clientHeight * 0.25),
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedSource]);

  const highlightStart = selectedSource
    ? Math.max(0, Math.min(document.text.length, selectedSource.startChar))
    : 0;
  const highlightEnd = selectedSource
    ? Math.max(highlightStart, Math.min(document.text.length, selectedSource.endChar))
    : 0;
  const hasHighlightedSource = Boolean(
    selectedSource && highlightEnd > highlightStart,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(document.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access might be blocked
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent-secondary-soft text-accent-secondary border border-border flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary truncate">
              Document Workspace
            </h2>
            <p className="text-xs text-text-muted truncate">
              {document.fileName}
            </p>
          </div>
        </div>

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Change document
          </button>
        )}
      </div>

      {/* Main body: status summary + scrollable extracted text */}
      <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4 overflow-hidden">
        {/* Document Status Banner */}
        <div className="rounded-xl border border-success-border bg-success-bg/40 p-4 shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-success-text">
                Document Ready for Socratic Tutoring
              </p>
              <p className="text-xs text-text-secondary truncate mt-0.5">
                {document.fileName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-secondary shrink-0">
            <span className="px-2 py-0.5 rounded-md bg-surface border border-border font-medium">
              {document.pageCount ? `${document.pageCount} pages` : "Parsed"}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-surface border border-border font-medium">
              {document.characterCount.toLocaleString()} chars
            </span>
          </div>
        </div>

        {selectedSource && sourceReferences && (
          <section
            aria-label="Source Explorer"
            className="shrink-0 rounded-xl border border-accent-primary/25 bg-accent-primary-soft/25 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-primary">
                  Source Explorer
                </p>
                <p
                  aria-live="polite"
                  className="mt-1 text-xs font-medium text-text-secondary"
                >
                  Source {selectedSourceIndex + 1} of {sourceReferences.length}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onSourceIndexChange?.(selectedSourceIndex - 1)
                  }
                  disabled={selectedSourceIndex <= 0}
                  aria-label="Previous source"
                  className="min-h-9 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSourceIndexChange?.(selectedSourceIndex + 1)
                  }
                  disabled={selectedSourceIndex >= sourceReferences.length - 1}
                  aria-label="Next source"
                  className="min-h-9 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={onCloseSourceExplorer}
                  aria-label="Close source explorer"
                  className="min-h-9 rounded-lg px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary">
                {selectedSource.fileName ?? document.fileName}
              </span>
              <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-secondary">
                {formatSourceLocation(selectedSource)}
              </span>
            </div>

            <blockquote className="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-surface/75 p-3 text-xs leading-relaxed text-text-secondary">
              {selectedSource.text}
            </blockquote>
          </section>
        )}

        {/* Extracted text container with its own scroll area */}
        <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-border bg-surface-elevated/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                Extracted Text
              </span>
              <span className="text-[11px] text-text-muted">
                (Grounding Source)
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface-hover transition-colors"
              title="Copy extracted text"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>

          <div ref={textContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 select-text">
            <pre className="whitespace-pre-wrap break-words text-xs sm:text-sm font-mono text-text-secondary leading-relaxed font-normal">
              {hasHighlightedSource ? (
                <>
                  {document.text.slice(0, highlightStart)}
                  <mark
                    ref={sourceMarkerRef}
                    className="rounded bg-accent-primary/25 text-text-primary ring-2 ring-accent-primary/40"
                  >
                    {document.text.slice(highlightStart, highlightEnd)}
                  </mark>
                  {document.text.slice(highlightEnd)}
                </>
              ) : (
                document.text
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSourceLocation(source: ChatSourceReference): string {
  if (source.pageNumbers.length > 0) {
    const label = source.pageNumbers.length === 1 ? "PDF page" : "PDF pages";
    return `${label} ${source.pageNumbers.join(", ")}`;
  }

  return `Text ${source.startChar}–${source.endChar}`;
}