import "server-only";
import * as mammoth from "mammoth";

export type ExtractableSourceType = "txt" | "csv" | "pdf" | "docx";

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
