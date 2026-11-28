/**
 * Replaces UTF-16 values PostgreSQL cannot represent while preserving valid
 * Unicode code points and their offsets in the extracted text.
 */
export function sanitizePdfText(text: string): string {
  let sanitized = "";

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);

    if (codeUnit === 0) {
      sanitized += "\uFFFD";
      continue;
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = text.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        sanitized += text[index] + text[index + 1];
        index += 1;
      } else {
        sanitized += "\uFFFD";
      }
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      sanitized += "\uFFFD";
      continue;
    }

    sanitized += text[index];
  }

  return sanitized;
}
