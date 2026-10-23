"use client";

import type { DocumentUploadSuccessData } from "@/types/document";

export interface DocumentPreviewProps {
  document: DocumentUploadSuccessData;
}

export function DocumentPreview({ document }: DocumentPreviewProps) {
  return (
    <section className="mb-6 rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-primary">Extracted text</h2>
        <p className="truncate text-xs text-muted">{document.fileName}</p>
      </header>
      <div className="max-h-64 overflow-y-auto p-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-secondary">
          {document.text}
        </p>
      </div>
    </section>
  );
}