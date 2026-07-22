import { describe, it, expect } from "vitest";
import { validateUpload, MAX_UPLOAD_BYTES } from "@/lib/brand-brain/validate-upload";

describe("validateUpload", () => {
  it("accepts a plausible plain-text buffer for .txt", () => {
    const buffer = Buffer.from("This is a normal brand style guide.\nSecond line.\n", "utf-8");
    expect(validateUpload(buffer, "txt")).toEqual({ ok: true });
  });

  it("accepts a plausible CSV buffer for .csv", () => {
    const buffer = Buffer.from("name,sku,price\nWidget,W-1,9.99\n", "utf-8");
    expect(validateUpload(buffer, "csv")).toEqual({ ok: true });
  });

  it("accepts a buffer with a valid PDF magic header for .pdf", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.4\n", "ascii"), Buffer.from("rest of fake pdf bytes")]);
    expect(validateUpload(buffer, "pdf")).toEqual({ ok: true });
  });

  it("accepts a buffer with a valid ZIP/DOCX magic header for .docx", () => {
    const buffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("fake docx zip contents"),
    ]);
    expect(validateUpload(buffer, "docx")).toEqual({ ok: true });
  });

  it("rejects an empty buffer", () => {
    const result = validateUpload(Buffer.alloc(0), "txt");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("rejects a buffer larger than the size cap", () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, "a");
    const result = validateUpload(oversized, "txt");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_large");
  });

  it("rejects a .pdf-named file whose content is not actually a PDF", () => {
    const buffer = Buffer.from("this is just plain text, not a pdf", "utf-8");
    const result = validateUpload(buffer, "pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("content_mismatch");
      expect(result.error).toMatch(/not a valid pdf/i);
    }
  });

  it("rejects a .docx-named file whose content is not a ZIP container", () => {
    const buffer = Buffer.from("this is just plain text, not a docx", "utf-8");
    const result = validateUpload(buffer, "docx");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("content_mismatch");
      expect(result.error).toMatch(/not a valid word document/i);
    }
  });

  it("rejects a .txt-named file that is actually binary data (mismatched extension/content)", () => {
    // Simulate a renamed binary (e.g. an .exe or image) — lots of NUL bytes
    // and non-printable control characters, which real text files never have.
    const binary = Buffer.alloc(2048);
    for (let i = 0; i < binary.length; i++) {
      binary[i] = i % 256;
    }
    const result = validateUpload(binary, "txt");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("content_mismatch");
  });

  it("rejects a PDF-magic buffer masquerading as .docx (cross content-type mismatch)", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.4\n", "ascii"), Buffer.from("pdf body")]);
    const result = validateUpload(buffer, "docx");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("content_mismatch");
  });
});
