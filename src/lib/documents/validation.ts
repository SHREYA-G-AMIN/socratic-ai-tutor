import "server-only";

import {
  MAX_UPLOAD_SIZE_BYTES,
  PDF_FILE_FIELD,
  PDF_MIME_TYPE,
  PDF_SIGNATURE,
  PDF_SIGNATURE_SEARCH_WINDOW,
} from "./constants";
import { DocumentProcessingError } from "./errors";

export interface ValidatedPdfUpload {
  /** The original file, kept so the caller can report its name and size. */
  file: File;
  /** Raw bytes of the uploaded PDF. */
  bytes: Uint8Array;
}

/**
 * Finds the uploaded file in a multipart/form-data body.
 *
 * The documented field name is `file`, but we fall back to the first file
 * present under any name so that a misnamed field still produces a useful
 * error message rather than a confusing "no file" response.
 */
export function findUploadedFile(formData: FormData): File {
  const named = formData.getAll(PDF_FILE_FIELD).filter(isFile);

  if (named.length > 1) {
    throw new DocumentProcessingError(
      "INVALID_REQUEST",
      "Only one file can be uploaded per request.",
    );
  }

  if (named.length === 1) {
    return named[0];
  }

  const fallback = Array.from(formData.values()).filter(isFile);

  if (fallback.length === 0) {
    throw new DocumentProcessingError(
      "NO_FILE_PROVIDED",
      `No file was uploaded. Send one PDF as multipart/form-data using the "${PDF_FILE_FIELD}" field.`,
    );
  }

  return fallback[0];
}

/**
 * Validates that the uploaded file is a PDF that we are willing to process.
 *
 * Three checks run in order of cost:
 *  1. the file is not empty,
 *  2. the file is not larger than the limit,
 *  3. the bytes really start with the `%PDF-` signature.
 *
 * The third check is the important one: a file name and a browser supplied
 * MIME type are both attacker controlled, so the file header is the only
 * trustworthy signal that the payload is a PDF.
 */
export async function validatePdfUpload(file: File): Promise<ValidatedPdfUpload> {
  if (file.size === 0) {
    throw new DocumentProcessingError(
      "EMPTY_FILE",
      "The uploaded file is empty. Please choose a PDF that contains content.",
    );
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new DocumentProcessingError(
      "FILE_TOO_LARGE",
      `The uploaded file is ${formatBytes(file.size)}. The maximum allowed size is ${formatBytes(MAX_UPLOAD_SIZE_BYTES)}.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!looksLikePdf(file, bytes)) {
    throw new DocumentProcessingError(
      "UNSUPPORTED_MEDIA_TYPE",
      `Only PDF files are supported. "${file.name}" is not a valid PDF (expected MIME type "${PDF_MIME_TYPE}" and a file that starts with "${PDF_SIGNATURE}").`,
    );
  }

  return { file, bytes };
}

/**
 * True when the bytes contain a PDF header.
 *
 * The header is searched for inside the first kilobyte because some
 * generators prepend a small amount of junk before the real header.
 */
function looksLikePdf(file: File, bytes: Uint8Array): boolean {
  const declaredAsPdf =
    file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith(".pdf");

  if (!declaredAsPdf) {
    return false;
  }

  return containsSignature(bytes);
}

function containsSignature(bytes: Uint8Array): boolean {
  const window = bytes.subarray(
    0,
    Math.min(bytes.length, PDF_SIGNATURE_SEARCH_WINDOW),
  );

  const signature = new TextEncoder().encode(PDF_SIGNATURE);

  for (let offset = 0; offset + signature.length <= window.length; offset++) {
    let matches = true;

    for (let index = 0; index < signature.length; index++) {
      if (window[offset + index] !== signature[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const megabytes = bytes / (1024 * 1024);

  return `${megabytes.toFixed(1)} MB`;
}
