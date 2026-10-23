"use client";

import { useRef, useState } from "react";

import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/documents/constants";
import type {
  DocumentUploadErrorCode,
  DocumentUploadErrorResponse,
  DocumentUploadResponse,
  DocumentUploadSuccessData,
} from "@/types/document";

const ERROR_TITLES: Record<DocumentUploadErrorCode, string> = {
  NO_FILE_PROVIDED: "No file selected",
  INVALID_REQUEST: "Invalid request",
  EMPTY_FILE: "Empty file",
  UNSUPPORTED_MEDIA_TYPE: "Not a PDF",
  FILE_TOO_LARGE: "File too large",
  PDF_PARSE_FAILED: "Could not read the PDF",
  NO_TEXT_CONTENT: "No readable text",
  TOO_MANY_PAGES: "Too many pages",
  EXTRACTION_FAILED: "Could not process the file",
};

const UPLOAD_TIMEOUT_MS = 60_000;

export interface PdfUploaderProps {
  onUploaded?: (document: DocumentUploadSuccessData) => void;
}

export function PdfUploader({ onUploaded }: PdfUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"uploading" | "processing" | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<DocumentUploadErrorResponse["error"] | null>(
    null,
  );

  const isBusy = stage !== null;

  function processFile(file: File) {
    setSelectedName(file.name);
    setError(null);

    if (file.type && file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setError({
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Only PDF files are supported. Please select a valid PDF.",
      });
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError({
        code: "FILE_TOO_LARGE",
        message: `This file is ${formatBytes(file.size)}. The maximum allowed size is ${formatBytes(MAX_UPLOAD_SIZE_BYTES)}.`,
      });
      return;
    }

    upload(file);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      processFile(file);
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    if (!isBusy) {
      setIsDragOver(true);
    }
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragOver(false);
    if (isBusy) return;

    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function upload(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/documents/upload");
    request.timeout = UPLOAD_TIMEOUT_MS;

    setStage("uploading");
    setProgress(0);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.upload.onload = () => {
      setStage("processing");
    };

    request.onload = () => {
      setStage(null);

      const body = parseResponse(request);

      if (body?.success) {
        onUploaded?.(body.data);
        return;
      }

      setError(
        body?.error ?? {
          code: "EXTRACTION_FAILED",
          message: "The server could not process the document.",
        },
      );
    };

    request.onerror = () => {
      setStage(null);
      setError({
        code: "EXTRACTION_FAILED",
        message:
          "The upload could not reach the server. Check your connection and try again.",
      });
    };

    request.ontimeout = () => {
      setStage(null);
      setError({
        code: "EXTRACTION_FAILED",
        message: "The upload timed out. Please try a smaller document.",
      });
    };

    request.send(formData);
  }

  return (
    <div className="space-y-6">
      {/* Heading & short supporting text */}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text-primary">
          Upload Course Material
        </h3>
        <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
          Upload your syllabus, textbook chapter, or lecture notes in PDF format.
          Your tutor will reference this content to guide your thinking.
        </p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,application/pdf"
        className="hidden"
      />

      {/* Dashed drop zone */}
      <div
        onClick={() => !isBusy && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isBusy) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-busy={isBusy}
        className={`w-full border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
          isDragOver
            ? "border-accent-primary bg-accent-primary-soft/30 scale-[1.005]"
            : "border-border hover:border-accent-primary hover:bg-surface-elevated/40 bg-surface-elevated/10"
        } ${isBusy ? "cursor-not-allowed opacity-75" : ""}`}
      >
        <div className="w-12 h-12 rounded-xl bg-surface-elevated border border-border flex items-center justify-center text-accent-primary shadow-xs">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-text-primary">
            {isBusy
              ? stage === "uploading"
                ? "Uploading document…"
                : "Extracting text…"
              : "Choose a PDF file or drag & drop here"}
          </p>
          <p className="text-xs text-text-muted">
            PDF syllabus, lecture notes, or textbooks up to 10MB
          </p>
        </div>
      </div>

      {/* Progress display */}
      {stage && (
        <div className="rounded-xl border border-border bg-surface-elevated/40 p-4 space-y-2" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
            <span className="truncate font-medium text-text-primary">{selectedName}</span>
            <span className="shrink-0 font-medium">
              {stage === "uploading" ? `${progress}%` : "Extracting text…"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full bg-accent-primary transition-[width] duration-200 ${
                stage === "processing" ? "animate-pulse" : ""
              }`}
              style={{
                width: stage === "processing" ? "100%" : `${progress}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          className="rounded-xl border border-error-border bg-error-bg p-4 flex items-start gap-3"
          role="alert"
        >
          <div className="w-5 h-5 rounded-full bg-error/15 text-error-text flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="text-xs">
            <p className="font-semibold text-error-text">
              {ERROR_TITLES[error.code]}
            </p>
            <p className="mt-0.5 text-error-text/90">{error.message}</p>
          </div>
        </div>
      )}

      {/* Guided Workspace Tips */}
      <div className="pt-2">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">
          How Socratic Tutoring Works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border border-border bg-surface-elevated/20 space-y-1">
            <div className="text-accent-primary text-xs font-semibold">1. Grounding</div>
            <p className="text-[11px] text-text-secondary leading-normal">
              Extracts concepts directly from your uploaded material.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-surface-elevated/20 space-y-1">
            <div className="text-accent-secondary text-xs font-semibold">2. Inquiry</div>
            <p className="text-[11px] text-text-secondary leading-normal">
              Asks guided questions instead of giving away direct answers.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-surface-elevated/20 space-y-1">
            <div className="text-info text-xs font-semibold">3. Recall</div>
            <p className="text-[11px] text-text-secondary leading-normal">
              Reinforces your understanding with step-by-step hints.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseResponse(request: XMLHttpRequest): DocumentUploadResponse | null {
  try {
    return JSON.parse(request.responseText) as DocumentUploadResponse;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}