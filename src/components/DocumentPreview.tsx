"use client";

import type { DocumentUploadSuccessData } from "@/types/document";

export interface DocumentPreviewProps {
  /** The document returned by the upload endpoint. */
  document: DocumentUploadSuccessData;
}

/**
 * Shows the text that was extracted from an uploaded document.
 *
 * The text can be very long, so it is kept in a panel of its own rather
 * than pushing the conversation off the screen.
 */
export function DocumentPreview({ document }: DocumentPreviewProps) {
  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Extracted text</h2>
        <p className="truncate text-xs text-slate-500">{document.fileName}</p>
      </header>
      <div className="max-h-64 overflow-y-auto p-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
          {document.text}
        </p>
      </div>
    </section>
  );
}
