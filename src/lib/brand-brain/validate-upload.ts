import "server-only";
import type { ExtractableSourceType } from "@/lib/brand-brain/extract-text";

/**
 * Server-side upload validation for Brand Brain documents.
 *
 * The client's `<input accept=".txt,.csv,.pdf,.docx">` (see
 * `upload-document-form.tsx`) is a UI hint only — a malicious or buggy
 * client can send any bytes under any filename, so every check here is
 * re-verified server-side against the actual buffer content, not the
 * filename extension alone.
 */

/** Hard cap on upload size. Chosen to comfortably fit real brand documents
 * (style guides, product catalogs) while bounding memory/CPU spent
 * buffering + parsing (PDF/DOCX parsing holds the whole buffer in memory). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export type UploadRejectionReason =
  | "too_large"
  | "empty"
  | "content_mismatch"
  | "unsupported_type";

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; reason: UploadRejectionReason; error: string };

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");
// DOCX (and any modern Office file) is a ZIP container; ZIP's local file
// header signature is "PK\x03\x04" (or the empty-archive variant "PK\x05\x06").
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY_MAGIC = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

/** Returns true if `buffer` starts with `magic`. */
function startsWith(buffer: Buffer, magic: Buffer): boolean {
  if (buffer.length < magic.length) return false;
  return buffer.subarray(0, magic.length).equals(magic);
}

/**
 * Heuristic "is this plausibly text" check for .txt/.csv: reject buffers
 * that are mostly binary (e.g. someone renames a .exe to .txt). Scans a
 * bounded prefix and rejects if it contains NUL bytes or an excessive
 * proportion of non-printable, non-whitespace control characters — real
 * UTF-8/ASCII text files essentially never contain these.
 */
function looksLikeText(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8192);
  if (sampleSize === 0) return false;

  let suspicious = 0;
  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    if (byte === 0x00) return false; // NUL byte: never valid in text
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7e;
    const isCommonWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    const isUtf8Continuation = byte >= 0x80; // allow UTF-8 multibyte sequences
    if (!isPrintableAscii && !isCommonWhitespace && !isUtf8Continuation) {
      suspicious++;
    }
  }

  return suspicious / sampleSize < 0.05;
}

/**
 * Validates an uploaded file's size and actual byte content against the
 * source type inferred from its filename extension. Returns a typed
 * rejection reason (never throws) so callers can surface a specific,
 * user-facing error.
 */
export function validateUpload(
  buffer: Buffer,
  sourceType: ExtractableSourceType,
): UploadValidationResult {
  if (buffer.length === 0) {
    return { ok: false, reason: "empty", error: "The uploaded file is empty." };
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      error: `File is too large. Maximum upload size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`,
    };
  }

  switch (sourceType) {
    case "pdf":
      if (!startsWith(buffer, PDF_MAGIC)) {
        return {
          ok: false,
          reason: "content_mismatch",
          error: "This file has a .pdf extension but its content is not a valid PDF.",
        };
      }
      return { ok: true };

    case "docx":
      if (!startsWith(buffer, ZIP_MAGIC) && !startsWith(buffer, ZIP_EMPTY_MAGIC)) {
        return {
          ok: false,
          reason: "content_mismatch",
          error: "This file has a .docx extension but its content is not a valid Word document.",
        };
      }
      return { ok: true };

    case "txt":
    case "csv":
      if (!looksLikeText(buffer)) {
        return {
          ok: false,
          reason: "content_mismatch",
          error: `This file has a .${sourceType} extension but its content does not look like plain text.`,
        };
      }
      return { ok: true };

    default: {
      const exhaustiveCheck: never = sourceType;
      return {
        ok: false,
        reason: "unsupported_type",
        error: `Unsupported source type: ${exhaustiveCheck}`,
      };
    }
  }
}
