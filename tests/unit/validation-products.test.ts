import { describe, it, expect } from "vitest";
import { productSchema, storeSchema, brandDocumentTextSchema, parseProductCsvRow } from "@/lib/validation/products";

describe("productSchema", () => {
  it("accepts a minimal valid product", () => {
    expect(productSchema.safeParse({ name: "Detangling Brush" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(productSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a negative price", () => {
    expect(
      productSchema.safeParse({ name: "Brush", priceCents: -100 }).success,
    ).toBe(false);
  });

  it("rejects an invalid product URL", () => {
    expect(
      productSchema.safeParse({ name: "Brush", productUrl: "not-a-url" }).success,
    ).toBe(false);
  });
});

describe("storeSchema", () => {
  it("accepts a valid platform", () => {
    expect(storeSchema.safeParse({ platform: "shopify" }).success).toBe(true);
  });

  it("rejects an empty platform", () => {
    expect(storeSchema.safeParse({ platform: "" }).success).toBe(false);
  });
});

describe("brandDocumentTextSchema", () => {
  it("accepts valid title + text", () => {
    expect(
      brandDocumentTextSchema.safeParse({ title: "Brand Voice", rawText: "Be friendly." })
        .success,
    ).toBe(true);
  });

  it("rejects empty text", () => {
    expect(
      brandDocumentTextSchema.safeParse({ title: "Brand Voice", rawText: "" }).success,
    ).toBe(false);
  });
});

describe("parseProductCsvRow", () => {
  it("converts a dollar price string into integer cents", () => {
    const result = parseProductCsvRow({ name: "Brush", price: "19.99" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceCents).toBe(1999);
    }
  });

  it("leaves priceCents undefined when price is blank", () => {
    const result = parseProductCsvRow({ name: "Brush", price: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceCents).toBeUndefined();
    }
  });

  it("rejects a row with no name", () => {
    const result = parseProductCsvRow({ name: "", price: "10" });
    expect(result.success).toBe(false);
  });

  it("ignores a non-numeric price rather than crashing", () => {
    const result = parseProductCsvRow({ name: "Brush", price: "N/A" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceCents).toBeUndefined();
    }
  });

  it("rejects an invalid product_url", () => {
    const result = parseProductCsvRow({ name: "Brush", product_url: "not-a-url" });
    expect(result.success).toBe(false);
  });
});
