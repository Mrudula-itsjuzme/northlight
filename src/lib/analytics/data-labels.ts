/**
 * Single, reused convention for labeling any metric or data row shown in
 * the UI as one of three provenance kinds. Every analytics surface (and
 * any other page showing seeded/demo or estimated data) must pick one of
 * these labels rather than inventing its own copy, so the meaning is
 * consistent everywhere:
 *
 * - "live"      — real data written by a real user action against a real
 *                 integration (e.g. a keyword the user typed in, an
 *                 article actually generated/published in this app).
 * - "estimated" — computed from real underlying data via a real formula,
 *                 but the formula itself involves an assumption/heuristic
 *                 (e.g. "estimated AI cost" derived from token counts and
 *                 a published per-1k-token price, or a deterministic
 *                 heuristic score). Not fabricated, but not a literal
 *                 ledger entry either.
 * - "demo"      — synthetic/seeded data (is_demo=true on the row, or the
 *                 owning brand has brands.is_demo=true, or the metric is
 *                 a stand-in for an integration this app doesn't have,
 *                 e.g. organic/AI-referral traffic with no analytics
 *                 provider configured).
 *
 * AI Visibility numbers must NEVER be labeled in a way that implies an
 * official citation count — see the methodology copy in
 * src/app/(app)/visibility and AI_SCORING.md. This module only supplies
 * the provenance label (live/estimated/demo); it does not change that
 * separate directional-only disclaimer.
 */
export type DataProvenance = "live" | "estimated" | "demo";

export const DATA_PROVENANCE_LABEL: Record<DataProvenance, string> = {
  live: "Live",
  estimated: "Estimated",
  demo: "Demo",
};

export const DATA_PROVENANCE_DESCRIPTION: Record<DataProvenance, string> = {
  live: "Real data from actions taken in this app.",
  estimated:
    "Computed from real underlying data using a documented formula or heuristic, not a literal external ledger.",
  demo: "Synthetic/seeded data, or a stand-in for an integration not configured in this environment.",
};

/**
 * Tailwind classes per provenance kind, reusing the existing
 * success/warning/demo design tokens (globals.css / tailwind.config.ts)
 * rather than inventing new colors — "demo" in particular is the same
 * purple token already used ad hoc in the Competitor Radar and AI
 * Visibility pages prior to this convention being extracted.
 */
export const DATA_PROVENANCE_BADGE_CLASS: Record<DataProvenance, string> = {
  live: "border-success/30 bg-success/10 text-success",
  estimated: "border-warning/30 bg-warning/10 text-warning",
  demo: "border-demo/30 bg-demo/10 text-demo",
};
