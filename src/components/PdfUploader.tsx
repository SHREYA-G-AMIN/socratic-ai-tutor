"use client";

import { useRef, useState } from "react";

import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/documents/constants";
import type {
  DocumentUploadErrorCode,
  DocumentUploadErrorResponse,
  DocumentUploadResponse,
  DocumentUploadSuccessData,
} from "@/types/document";

/**
 * Short, human readable heading for each error the API can return.
 */
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

/** The server allows 20s for extraction, so give the whole request a minute. */
const UPLOAD_TIMEOUT_MS = 60_000;

export interface PdfUploaderProps {
  /**
   * Called with the extracted document once the server has processed the
   * file. It is not called when the upload fails.
   */
  onUploaded?: (document: DocumentUploadSuccessData) => void;
}

/**
 * Uploads a PDF to the document endpoint and reports the result.
 *
 * The component owns the whole flow: choosing a file, checking its size
 * before anything is sent, uploading it, and turning either the extracted
 * document or an error into something the student can read.
 *
 * The file itself is sent straight to the server and never handled by any
 * other part of the application.
 */
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

    // Reset the input so picking the same file twice still fires a change.
    event.target.value = "";

    if (!file) {
      return;
    }

    setSelectedName(file.name);
    setError(null);
    setUploaded(null);

    // Check the size here so an oversized file fails immediately instead of
    // after the whole thing has been sent. The server checks it again.
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

    // XMLHttpRequest is used instead of fetch because it can report how much
    // of the file has been uploaded. fetch has no equivalent.
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
      // The file has been sent, the server is now parsing the PDF.
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
        className="w-full border-2 border-dashed border-slate-300 rounded-lg p-6 md:p-10 text-center hover:bg-slate-50 hover:border-blue-400 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:border-slate-300"
      >
        <p className="text-slate-600 font-medium">
          {isBusy ? "Uploading PDF..." : "Click to upload PDF"}
        </p>
        <p className="text-xs text-slate-400 mt-2">Max file size: 10MB</p>
      </button>

      {stage && (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="truncate">{selectedName}</span>
            <span className="shrink-0">
              {stage === "uploading" ? `${progress}%` : "Extracting text..."}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full bg-blue-600 transition-[width] duration-200 ${
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
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3"
          role="alert"
        >
          <p className="text-sm font-medium text-red-800">
            {ERROR_TITLES[error.code]}
          </p>
          <p className="mt-1 text-sm text-red-700">{error.message}</p>
        </div>
      )}

      {uploaded && !error && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-medium text-green-800">Document ready</p>
          <p className="mt-1 truncate text-sm text-green-700">
            {uploaded.fileName}
          </p>
          <p className="mt-1 text-xs text-green-700">
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
