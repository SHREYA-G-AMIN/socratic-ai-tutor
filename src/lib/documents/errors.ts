import type { DocumentUploadErrorCode } from "@/types/document";

/**
 * HTTP status for every error code the upload endpoint can return.
 *
 * Keeping the mapping next to the codes means the route handler never has to
 * decide on a status code, and the client can rely on a stable contract.
 */
const STATUS_BY_CODE: Record<DocumentUploadErrorCode, number> = {
  // The request itself is malformed.
  NO_FILE_PROVIDED: 400,
  INVALID_REQUEST: 400,
  EMPTY_FILE: 400,
  // The request is well formed but carries the wrong kind of content.
  UNSUPPORTED_MEDIA_TYPE: 415,
  FILE_TOO_LARGE: 413,
  // The file claims to be a PDF but could not be processed.
  PDF_PARSE_FAILED: 422,
  NO_TEXT_CONTENT: 422,
  TOO_MANY_PAGES: 422,
  // Something on the server went wrong.
  EXTRACTION_FAILED: 500,
};

/**
 * An error that carries a machine-readable code and an HTTP status.
 *
 * Throwing this instead of returning `Response.json` from deep inside the
 * pipeline keeps the error handling in one place: the route handler catches
 * it and turns it into the standard error envelope.
 */
export class DocumentProcessingError extends Error {
  readonly code: DocumentUploadErrorCode;
  readonly status: number;

  constructor(code: DocumentUploadErrorCode, message: string) {
    super(message);
    this.name = "DocumentProcessingError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
