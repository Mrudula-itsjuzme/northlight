import "server-only";
import * as mammoth from "mammoth";

export type ExtractableSourceType = "txt" | "csv" | "pdf" | "docx";

function ensureNodeDomPolyfills() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    class DOMMatrixPolyfill {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true;
      isIdentity = true;
      constructor(init?: any) {
        if (Array.isArray(init) && init.length >= 6) {
          this.a = init[0]; this.b = init[1]; this.c = init[2];
          this.d = init[3]; this.e = init[4]; this.f = init[5];
          this.m11 = init[0]; this.m12 = init[1]; this.m21 = init[2];
          this.m22 = init[3]; this.m41 = init[4]; this.m42 = init[5];
        }
      }
      translate() { return this; }
      scale() { return this; }
      multiply() { return this; }
      rotate() { return this; }
      inverse() { return this; }
      transformPoint(p: any) { return p; }
      toFloat32Array() { return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f]); }
      toFloat64Array() { return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]); }
    }
    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
  }
  if (typeof globalThis.Path2D === "undefined") {
    (globalThis as any).Path2D = class Path2D {};
  }
  if (typeof globalThis.ImageData === "undefined") {
    (globalThis as any).ImageData = class ImageData {};
  }
}

/**
 * Extracts plain text from an uploaded file's raw bytes. TXT/CSV need no
 * real extraction (they're already text); PDF and DOCX go through a
 * lightweight parser (`pdf-parse`, `mammoth`) rather than a heavier OCR/
 * layout-analysis pipeline, since Brand Brain only needs the text content
 * for chunking/embedding, not visual layout.
 */
export async function extractText(
  sourceType: ExtractableSourceType,
  buffer: Buffer,
): Promise<string> {
  switch (sourceType) {
    case "txt":
    case "csv":
      return buffer.toString("utf-8");

    case "pdf": {
      ensureNodeDomPolyfills();
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }

    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    default: {
      const exhaustiveCheck: never = sourceType;
      throw new Error(`Unsupported source type: ${exhaustiveCheck}`);
    }
  }
}

/** Maps a file's extension to a supported source type, or null if unsupported. */
export function sourceTypeFromFilename(filename: string): ExtractableSourceType | null {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "txt":
      return "txt";
    case "csv":
      return "csv";
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    default:
      return null;
  }
}
