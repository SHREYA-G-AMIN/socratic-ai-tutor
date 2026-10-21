/**
 * Limits and constants shared by the document processing pipeline.
 *
 * These are intentionally kept in one place so the upload route, the
 * validation layer and the extractor cannot drift apart.
 */

/** Name of the multipart/form-data field that carries the PDF. */
export const PDF_FILE_FIELD = "file";

/** MIME type browsers report for a PDF file. */
export const PDF_MIME_TYPE = "application/pdf";

/** Every PDF file starts with this ASCII signature. */
export const PDF_SIGNATURE = "%PDF-";

/**
 * Some real-world PDFs carry a few junk bytes before the header. The PDF
 * specification allows the header to appear within the first 1024 bytes,
 * so we search that window instead of requiring byte 0 to match.
 */
export const PDF_SIGNATURE_SEARCH_WINDOW = 1024;

/** Maximum accepted upload size: 10 MB. Matches the limit shown in the UI. */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of pages we are willing to process in one request. */
export const MAX_PDF_PAGES = 500;

/** Maximum number of characters returned to the client in one response. */
export const MAX_EXTRACTED_CHARACTERS = 500_000;

/** Maximum size of a single embedded image, in pixels (16 MP). */
export const MAX_IMAGE_SIZE = 16_777_216;

/** Time budget for a single extraction, in milliseconds. */
export const EXTRACTION_TIMEOUT_MS = 20_000;
