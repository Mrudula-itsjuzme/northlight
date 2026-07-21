import Papa from "papaparse";
import { parseKeywordCsvRow, type KeywordInput } from "@/lib/validation/keywords";
import type { CsvRowError } from "@/lib/csv/parse-products";

export type ParseKeywordsCsvResult = {
  validRows: KeywordInput[];
  errors: CsvRowError[];
  totalRows: number;
};

/**
 * Parses a keyword CSV (columns: term, volume, difficulty,
 * commercial_intent, trend, business_value — all but `term` optional and
 * defaulting to 0) and validates every row, reporting bad rows
 * individually rather than dropping them silently — same contract as
 * `parseProductsCsv` (Phase 3).
 */
export function parseKeywordsCsv(fileContents: string): ParseKeywordsCsvResult {
  const parsed = Papa.parse<Record<string, string>>(fileContents, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const validRows: KeywordInput[] = [];
  const errors: CsvRowError[] = [];

  parsed.data.forEach((raw, index) => {
    const result = parseKeywordCsvRow(raw);
    if (result.success) {
      validRows.push(result.data);
    } else {
      errors.push({
        row: index + 1,
        raw,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".") || "row"}: ${issue.message}`,
        ),
      });
    }
  });

  for (const parseError of parsed.errors) {
    errors.push({ row: (parseError.row ?? -1) + 1, raw: {}, errors: [parseError.message] });
  }

  return { validRows, errors, totalRows: parsed.data.length };
}
