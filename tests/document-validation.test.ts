import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./server-only-hook.mjs", import.meta.url);

const { findUploadedFile, validatePdfUpload } = await import(
  "../src/lib/documents/validation.ts"
);
const { DocumentProcessingError } = await import(
  "../src/lib/documents/errors.ts"
);

function createPdf(name = "notes.pdf", content = "%PDF-1.7\ncontent") {
  return new File([content], name, { type: "application/pdf" });
}

test("finds the named PDF file", () => {
  const formData = new FormData();
  const file = createPdf();
  formData.append("file", file);

  assert.equal(findUploadedFile(formData), file);
});

test("accepts one file from a nonstandard multipart field", () => {
  const formData = new FormData();
  const file = createPdf("notes.pdf");
  formData.append("upload", file);

  assert.equal(findUploadedFile(formData), file);
});

test("rejects multiple files even when one uses the expected field", () => {
  const formData = new FormData();
  formData.append("file", createPdf("first.pdf"));
  formData.append("other", createPdf("second.pdf"));

  assert.throws(
    () => findUploadedFile(formData),
    (error: unknown) =>
      error instanceof DocumentProcessingError &&
      error.code === "INVALID_REQUEST",
  );
});

test("rejects a multipart request with no file", () => {
  assert.throws(
    () => findUploadedFile(new FormData()),
    (error: unknown) =>
      error instanceof DocumentProcessingError &&
      error.code === "NO_FILE_PROVIDED",
  );
});

test("rejects empty files and PDFs with an invalid signature", async () => {
  await assert.rejects(
    validatePdfUpload(createPdf("empty.pdf", "")),
    (error: unknown) =>
      error instanceof DocumentProcessingError &&
      error.code === "EMPTY_FILE",
  );

  await assert.rejects(
    validatePdfUpload(createPdf("not-a-pdf.pdf", "not a PDF")),
    (error: unknown) =>
      error instanceof DocumentProcessingError &&
      error.code === "UNSUPPORTED_MEDIA_TYPE",
  );
});
