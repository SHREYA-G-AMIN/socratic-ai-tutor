import { DocumentProcessingError } from "@/lib/documents/errors";
import { extractPdfText } from "@/lib/documents/pdf-extractor";
import {
  findUploadedFile,
  validatePdfUpload,
} from "@/lib/documents/validation";
import {
  MAX_PDF_PAGES,
  MAX_UPLOAD_SIZE_BYTES,
  PDF_FILE_FIELD,
} from "@/lib/documents/constants";
import type {
  DocumentUploadErrorResponse,
  DocumentUploadResponse,
} from "@/types/document";

/**
 * POST /api/documents/upload
 *
 * Accepts exactly one PDF as `multipart/form-data` and returns its extracted
 * text as JSON.
 *
 * The route handler runs on the server only. The uploaded file is read into
 * memory, parsed, and discarded; it is never written to disk and no
 * credentials are involved at this stage.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await parseFormData(request);
    const file = findUploadedFile(formData);
    const { file: upload, bytes } = await validatePdfUpload(file);
    const extraction = await extractPdfText(bytes);

    const body: DocumentUploadResponse = {
      success: true,
      data: {
        fileName: upload.name,
        fileSizeBytes: upload.size,
        pageCount: extraction.pageCount,
        characterCount: extraction.characterCount,
        text: extraction.text,
        truncated: extraction.truncated,
      },
    };

    return Response.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentProcessingError) {
      return Response.json(toErrorBody(error), { status: error.status });
    }

    // The error message may contain internal details, so it is logged on the
    // server and a generic message is returned to the client.
    console.error("[api/documents/upload] unexpected failure", error);

    return Response.json(
      toErrorBody(
        new DocumentProcessingError(
          "EXTRACTION_FAILED",
          "The document could not be processed. Please try again with a different file.",
        ),
      ),
      { status: 500 },
    );
  }
}

/**
 * GET /api/documents/upload
 *
 * Describes the endpoint so the contract can be inspected without uploading
 * anything.
 */
export function GET(): Response {
  return Response.json({
    success: true,
    data: {
      method: "POST",
      contentType: "multipart/form-data",
      field: PDF_FILE_FIELD,
      maxFileSizeBytes: MAX_UPLOAD_SIZE_BYTES,
      maxPages: MAX_PDF_PAGES,
      description:
        "Upload a single PDF. Returns the extracted text, character count and page count.",
    },
  });
}

/**
 * Reads the multipart body, turning a malformed request into a clear error.
 */
async function parseFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new DocumentProcessingError(
      "INVALID_REQUEST",
      "The request body could not be read. Send the PDF as multipart/form-data.",
    );
  }
}

function toErrorBody(error: DocumentProcessingError): DocumentUploadErrorResponse {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
  };
}
