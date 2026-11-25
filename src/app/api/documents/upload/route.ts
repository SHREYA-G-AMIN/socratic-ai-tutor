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
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * POST /api/documents/upload
 *
 * Accepts exactly one PDF as `multipart/form-data` and returns its extracted
 * text as JSON.
 *
 * The route handler runs on the server only. The uploaded file is read into
 * memory, parsed, and discarded; scanned PDFs use the server-side Gemini key
 * for OCR. The original PDF is never written to disk.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const formData = await parseFormData(request);
    const file = findUploadedFile(formData);
    const { file: upload, bytes } = await validatePdfUpload(file);
    const extraction = await extractPdfText(bytes);
    const { data: savedDocument, error: saveError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        file_name: upload.name,
        file_size_bytes: upload.size,
        page_count: extraction.pageCount,
        character_count: extraction.characterCount,
        extracted_text: extraction.text,
        page_ranges: extraction.pageRanges,
        ocr_used: extraction.ocrUsed ?? false,
        ocr_provider: extraction.ocrProvider ?? null,
      })
      .select("id")
      .single();

    if (saveError || !savedDocument) {
      console.error("[api/documents/upload] metadata persistence failed", saveError?.message);
      return Response.json(
        toErrorBody(new DocumentProcessingError("EXTRACTION_FAILED", "The PDF was processed but could not be saved to your account. Please try again.")),
        { status: 500 },
      );
    }

    const body: DocumentUploadResponse = {
      success: true,
      data: {
        id: savedDocument.id,
        fileName: upload.name,
        fileSizeBytes: upload.size,
        pageCount: extraction.pageCount,
        characterCount: extraction.characterCount,
        text: extraction.text,
        pageRanges: extraction.pageRanges,
        truncated: extraction.truncated,
        ocrUsed: extraction.ocrUsed ?? false,
        ...(extraction.ocrProvider ? { ocrProvider: extraction.ocrProvider } : {}),
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
        "Upload a single PDF. Returns extracted text and page ranges; scanned PDFs use Gemini OCR with a local Tesseract fallback.",
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
