import { describe, it, expect } from "vitest";
import { parseProductsCsv } from "@/lib/csv/parse-products";

describe("parseProductsCsv", () => {
  it("parses valid rows", () => {
    const csv = `name,sku,price,description,product_url
Detangling Brush,BR-001,14.99,Gentle on curls,https://example.com/brush
Silk Scrunchie,SC-002,6.50,,https://example.com/scrunchie`;

    const result = parseProductsCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toHaveLength(2);
    expect(result.validRows[0]).toMatchObject({
      name: "Detangling Brush",
      sku: "BR-001",
      priceCents: 1499,
    });
  });

  it("reports bad rows with row number and reason instead of dropping them silently", () => {
    const csv = `name,sku,price,description,product_url
,SC-003,9.99,Missing name,https://example.com/x
Valid Product,SC-004,5.00,,https://example.com/y`;

    const result = parseProductsCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].name).toBe("Valid Product");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].errors.join(" ")).toMatch(/name/i);
  });

  it("handles headers with different casing/whitespace", () => {
    const csv = `Name , SKU ,Price\nBrush,BR-1,10`;
    const result = parseProductsCsv(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].name).toBe("Brush");
  });

  it("returns zero rows for an empty CSV body", () => {
    const csv = `name,sku,price`;
    const result = parseProductsCsv(csv);
    expect(result.totalRows).toBe(0);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a row with an invalid product URL while keeping other valid rows", () => {
    const csv = `name,product_url
Bad URL Product,not-a-url
Good Product,https://example.com/good`;
    const result = parseProductsCsv(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].name).toBe("Good Product");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
  });
});
