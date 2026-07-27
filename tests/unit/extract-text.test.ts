import { describe, expect, it } from "vitest";
import { extractText, sourceTypeFromFilename } from "@/lib/brand-brain/extract-text";

describe("extractText & sourceTypeFromFilename", () => {
  it("detects source type from filenames", () => {
    expect(sourceTypeFromFilename("document.txt")).toBe("txt");
    expect(sourceTypeFromFilename("data.csv")).toBe("csv");
    expect(sourceTypeFromFilename("guide.pdf")).toBe("pdf");
    expect(sourceTypeFromFilename("brief.docx")).toBe("docx");
    expect(sourceTypeFromFilename("image.png")).toBeNull();
  });

  it("extracts text from txt buffer", async () => {
    const text = "Brand guideline content for Northlight.";
    const buffer = Buffer.from(text, "utf-8");
    const extracted = await extractText("txt", buffer);
    expect(extracted).toBe(text);
  });

  it("extracts text from csv buffer", async () => {
    const csv = "Product Name,Category,Price\nWidget A,SaaS,99";
    const buffer = Buffer.from(csv, "utf-8");
    const extracted = await extractText("csv", buffer);
    expect(extracted).toBe(csv);
  });

  it("handles node DOMMatrix polyfills for PDF extraction without throwing", async () => {
    const dummyPdfBuffer = Buffer.from("%PDF-1.4\n%...\n%%EOF");
    try {
      await extractText("pdf", dummyPdfBuffer);
    } catch (err) {
      // PDFParse will fail parsing invalid PDF bytes, but it MUST NOT throw "DOMMatrix is not defined"
      expect(err instanceof Error ? err.message : "").not.toContain("DOMMatrix is not defined");
    }
  });
});
