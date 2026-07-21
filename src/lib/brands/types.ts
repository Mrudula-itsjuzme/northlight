import type { BrandRole } from "@/lib/validation/brands";

export const CURRENT_BRAND_COOKIE = "nl_current_brand";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type BrandListItem = {
  id: string;
  name: string;
  slug: string;
  vertical: string | null;
  role: BrandRole;
};
