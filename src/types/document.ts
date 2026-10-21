/**
 * Shared contract for the document upload API.
 *
 * These types are imported by both the server-side route handler and any
 * client component that will later call it, so they must stay free of
 * server-only imports.
 */

export type DocumentUploadErrorCode =
  | "NO_FILE_PROVIDED"
  | "INVALID_REQUEST"
  | "EMPTY_FILE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "PDF_PARSE_FAILED"
  | "NO_TEXT_CONTENT"
  | "TOO_MANY_PAGES"
  | "EXTRACTION_FAILED";

export interface DocumentUploadSuccessData {
  /** Original file name, as sent by the client. */
  fileName: string;
  /** Size of the uploaded file in bytes. */
  fileSizeBytes: number;
  /** Number of pages reported by the PDF parser, or null when unknown. */
  pageCount: number | null;
  /** Number of characters in the returned `text` value. */
  characterCount: number;
  /** The extracted, whitespace-normalised text of the document. */
  text: string;
  /** True when the extracted text was longer than the response limit. */
  truncated: boolean;
}

export interface DocumentUploadSuccessResponse {
  success: true;
  data: DocumentUploadSuccessData;
}

export interface DocumentUploadErrorResponse {
  success: false;
  error: {
    code: DocumentUploadErrorCode;
    message: string;
  };
}

export type DocumentUploadResponse =
  | DocumentUploadSuccessResponse
  | DocumentUploadErrorResponse;
