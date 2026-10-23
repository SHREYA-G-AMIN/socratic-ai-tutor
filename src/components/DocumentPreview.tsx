"use client";

import type { DocumentUploadSuccessData } from "@/types/document";

export interface DocumentPreviewProps {
  document: DocumentUploadSuccessData;
}

export function DocumentPreview({ document }: DocumentPreviewProps) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-accent-secondary flex items-center justify-center text-text-on-accent font-medium text-xs">
            T
          </div>
          <h2 className="text-sm font-semibold text-primary">Extracted text</h2>
        </div>
        <p className="truncate text-xs text-muted">{document.fileName}</p>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-secondary">
          {document.text}
        </p>
      </div>
    </section>
  );
}