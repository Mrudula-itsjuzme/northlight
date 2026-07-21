import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(1, "Product name is required").max(300),
  sku: z.string().max(100).optional().or(z.literal("")),
  priceCents: z
    .number()
    .int()
    .nonnegative("Price must be zero or positive")
    .optional(),
  description: z.string().max(5000).optional().or(z.literal("")),
  productUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

export type ProductInput = z.infer<typeof productSchema>;

/**
 * Row shape as parsed directly out of a CSV (all strings, since CSV has no
 * native types). `price` is a human-entered dollar amount (e.g. "19.99"),
 * converted to integer cents during validation.
 */
const productCsvRawRowSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  sku: z.string().trim().optional(),
  price: z.string().trim().optional(),
  description: z.string().trim().optional(),
  product_url: z.string().trim().optional(),
});

/**
 * Validates+transforms a single CSV row (all-string input) into a
 * `ProductInput`. Implemented as an explicit function (rather than
 * `.transform().pipe(productSchema)`) so the intermediate shape doesn't
 * have to structurally match `z.input<typeof productSchema>` exactly
 * (optional vs. `| undefined` mismatches between the two schemas otherwise
 * fail to typecheck under zod 4's stricter `.pipe()` inference).
 */
export function parseProductCsvRow(
  raw: unknown,
): ReturnType<typeof productSchema.safeParse> {
  const rawResult = productCsvRawRowSchema.safeParse(raw);
  if (!rawResult.success) {
    return rawResult as unknown as ReturnType<typeof productSchema.safeParse>;
  }

  const row = rawResult.data;
  let priceCents: number | undefined;
  if (row.price && row.price.length > 0) {
    const parsed = Number.parseFloat(row.price);
    if (!Number.isNaN(parsed)) {
      priceCents = Math.round(parsed * 100);
    }
  }

  return productSchema.safeParse({
    name: row.name,
    sku: row.sku || undefined,
    priceCents,
    description: row.description || undefined,
    productUrl: row.product_url || undefined,
  });
}

export const storeSchema = z.object({
  platform: z.string().min(1, "Platform is required").max(100),
  storeUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

export type StoreInput = z.infer<typeof storeSchema>;

export const brandDocumentTextSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  rawText: z.string().min(1, "Document text cannot be empty").max(200_000),
});

export type BrandDocumentTextInput = z.infer<typeof brandDocumentTextSchema>;
