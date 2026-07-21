import Papa from "papaparse";
import { parseProductCsvRow, type ProductInput } from "@/lib/validation/products";

export type CsvRowError = {
  row: number; // 1-based, matches the row order in the file (header excluded)
  raw: Record<string, unknown>;
  errors: string[];
};

export type ParseProductsCsvResult = {
  validRows: ProductInput[];
  errors: CsvRowError[];
  totalRows: number;
};

/**
 * Parses a product CSV and validates every row against `productCsvRowSchema`.
 * Bad rows are reported with their row number and specific validation
 * errors rather than silently dropped — the caller decides whether to
 * import the valid rows and show the errors, or reject the whole file.
 * Expected headers: name, sku, price, description, product_url (sku, price,
 * description, product_url are all optional).
 */
export function parseProductsCsv(fileContents: string): ParseProductsCsvResult {
  const parsed = Papa.parse<Record<string, string>>(fileContents, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const validRows: ProductInput[] = [];
  const errors: CsvRowError[] = [];

  parsed.data.forEach((raw, index) => {
    const result = parseProductCsvRow(raw);
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

  // Surface Papa's own parse errors (malformed rows, e.g. wrong column
  // count) as row errors too, so nothing is silently dropped.
  for (const parseError of parsed.errors) {
    errors.push({
      row: (parseError.row ?? -1) + 1,
      raw: {},
      errors: [parseError.message],
    });
  }

  return {
    validRows,
    errors,
    totalRows: parsed.data.length,
  };
}
