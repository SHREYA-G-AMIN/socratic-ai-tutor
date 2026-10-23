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
  const [error, setError] = useState<DocumentUploadErrorResponse["error"] | null>(
    null,
  );
  const [uploaded, setUploaded] = useState<DocumentUploadSuccessData | null>(
    null,
  );

  const isBusy = stage !== null;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    setSelectedName(file.name);
    setError(null);
    setUploaded(null);

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError({
        code: "FILE_TOO_LARGE",
        message: `This file is ${formatBytes(file.size)}. The maximum allowed size is ${formatBytes(MAX_UPLOAD_SIZE_BYTES)}.`,
      });
      return;
    }

    upload(file);
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
        setUploaded(body.data);
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
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,application/pdf"
        className="hidden"
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isBusy}
        aria-busy={isBusy}
        className="w-full border-2 border-dashed border-border rounded-lg p-6 md:p-10 text-center hover:bg-surface-hover hover:border-accent-primary transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:border-border"
      >
        <p className="text-secondary font-medium">
          {isBusy ? "Uploading PDF..." : "Click to upload PDF"}
        </p>
        <p className="text-xs text-muted mt-2">Max file size: 10MB</p>
      </button>

      {stage && (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-xs text-secondary">
            <span className="truncate">{selectedName}</span>
            <span className="shrink-0">
              {stage === "uploading" ? `${progress}%` : "Extracting text..."}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
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

      {error && (
        <div
          className="mt-4 rounded-lg border border-error-border bg-error-bg p-3"
          role="alert"
        >
          <p className="text-sm font-medium text-error-text">
            {ERROR_TITLES[error.code]}
          </p>
          <p className="mt-1 text-sm text-error-text">{error.message}</p>
        </div>
      )}

      {uploaded && !error && (
        <div className="mt-4 rounded-lg border border-success-border bg-success-bg p-3">
          <p className="text-sm font-medium text-success-text">Document ready</p>
          <p className="mt-1 truncate text-sm text-success-text">
            {uploaded.fileName}
          </p>
          <p className="mt-1 text-xs text-success-text">
            {uploaded.pageCount ?? "?"} pages ·{" "}
            {uploaded.characterCount.toLocaleString()} characters
          </p>
        </div>
      )}
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