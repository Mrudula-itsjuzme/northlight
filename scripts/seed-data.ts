/**
 * Static fixture data for scripts/seed.ts — the "tween haircare" demo
 * brand's products, brand documents, keyword raw inputs, competitors,
 * AI prompts, and article topics. Kept separate from the orchestration
 * script (which does the actual DB writes / calls the real scoring and
 * pipeline functions) so both files stay under a reasonable size and
 * the fixture content itself is easy to review/tune independently of
 * the seeding logic.
 */

export const DEMO_BRAND = {
  name: "Curl Co",
  slug: "curl-co-demo",
  vertical: "tween haircare",
  websiteUrl: "https://curlco.demo.invalid",
};

export const DEMO_USER = {
  // Local/demo-only — see README.md "Demo login" section. Never a real
  // secret; this account only ever exists in a local/dev Supabase
  // project seeded by this script, which creates it via the Supabase
  // Admin API (auth.admin.createUser) using the service role key, so no
  // manual dashboard steps are needed after `npm run db:seed`.
  email: "demo@curlco.northlight.test",
  password: "NorthlightDemo123!",
  fullName: "Demo Owner",
};

export const DEMO_PRODUCTS = [
  {
    name: "Detangling Brush for Curls",
    sku: "CC-BRUSH-001",
    priceCents: 1899,
    description:
      "A flexible-bristle detangling brush designed for tween curly and coily hair, reduces breakage during wet brushing.",
  },
  {
    name: "Leave-In Curl Conditioner",
    sku: "CC-COND-002",
    priceCents: 1499,
    description:
      "Lightweight leave-in conditioner formulated without sulfates or parabens, safe for daily use on tween hair.",
  },
  {
    name: "Silk Scrunchie 3-Pack",
    sku: "CC-SCRUNCH-003",
    priceCents: 1299,
    description: "Silk scrunchies that reduce hair breakage and frizz compared to standard elastics.",
  },
  {
    name: "Curl Defining Cream",
    sku: "CC-CREAM-004",
    priceCents: 1699,
    description: "A lightweight curl cream that defines curls without crunch or residue buildup.",
  },
  {
    name: "Wide-Tooth Comb",
    sku: "CC-COMB-005",
    priceCents: 799,
    description: "A wide-tooth comb for gentle detangling of wet curly hair, minimizing breakage.",
  },
];

export const DEMO_BRAND_DOCUMENTS = [
  {
    title: "Brand Voice & Tone Guide",
    rawText: `Curl Co Brand Voice Guide

Curl Co speaks to parents and tweens (ages 8-14) navigating curly and coily hair care for the first time. Our tone is warm, encouraging, and never condescending — we treat tweens as capable of caring for their own hair with the right guidance.

Key principles:
1. Always explain WHY a technique works, not just what to do.
2. Avoid shaming language around hair texture, volume, or "unmanageable" hair.
3. Center safety: every product recommendation should note age-appropriateness and any patch-test guidance.
4. Use simple, concrete language. Avoid jargon like "porosity" without defining it first.
5. Celebrate curl diversity — 2A through 4C are all "normal."

Every piece of content should answer a real question a parent or tween searched for, and should cite at least one credible external source (e.g. a dermatologist-reviewed guide) when making a claim about hair health or safety.`,
  },
  {
    title: "Ingredient Safety Policy",
    rawText: `Curl Co Ingredient Safety Policy

All Curl Co products are formulated without sulfates, parabens, or synthetic fragrance dyes known to trigger scalp sensitivity in children. Every new formulation undergoes a dermatologist patch-test review before launch.

For tween-specific products, we additionally screen for:
- Essential oil concentration above 1% (some essential oils are not recommended for children under 12 without dilution)
- Any ingredient on the EWG "high concern" list for children's personal care products

Content referencing product safety must cite this policy directly rather than making unverifiable claims about "100% natural" or "chemical-free" — those terms are not regulated and can mislead. Prefer specific, verifiable claims: "sulfate-free," "dermatologist patch-tested," "fragrance-free."`,
  },
  {
    title: "Product Care & Usage Guide",
    rawText: `Curl Co Product Care Guide

Detangling Brush for Curls: Use ONLY on wet hair with conditioner applied. Using on dry hair increases breakage risk. Start detangling from the ends and work upward to the roots.

Leave-In Curl Conditioner: Apply to soaking wet hair immediately after washing, focusing on mid-lengths and ends. A little goes a long way — start with a dime-sized amount.

Curl Defining Cream: Apply to damp (not soaking wet) hair after leave-in conditioner. Scrunch upward rather than rubbing to avoid disrupting curl pattern.

Silk Scrunchies: Hand wash only. Avoid twisting tightly around the same section of hair repeatedly to reduce tension-related breakage.

Wide-Tooth Comb: Best used in the shower with conditioner still in the hair, before rinsing, for the gentlest detangling experience.`,
  },
];

/**
 * Keyword raw inputs spanning a realistic range so priority scores vary
 * meaningfully (per Phase 13's requirement) once run through the real
 * min-max-normalized scoring formula in src/lib/scoring/priority.ts.
 * rawVolume/rawDifficulty are 0-100 scale; the rest are already 0-1.
 */
export const DEMO_KEYWORDS = [
  { term: "detangling brush for curly hair", rawVolume: 90, rawDifficulty: 45, rawCommercialIntent: 0.8, rawTrend: 0.7, rawBusinessValue: 0.9 },
  { term: "best leave-in conditioner for kids curly hair", rawVolume: 70, rawDifficulty: 40, rawCommercialIntent: 0.75, rawTrend: 0.6, rawBusinessValue: 0.85 },
  { term: "how to detangle curly hair without breakage", rawVolume: 60, rawDifficulty: 30, rawCommercialIntent: 0.3, rawTrend: 0.65, rawBusinessValue: 0.5 },
  { term: "curly hair routine for tweens", rawVolume: 45, rawDifficulty: 35, rawCommercialIntent: 0.4, rawTrend: 0.75, rawBusinessValue: 0.6 },
  { term: "sulfate free shampoo for kids", rawVolume: 55, rawDifficulty: 50, rawCommercialIntent: 0.7, rawTrend: 0.5, rawBusinessValue: 0.7 },
  { term: "silk scrunchies vs regular hair ties", rawVolume: 25, rawDifficulty: 20, rawCommercialIntent: 0.5, rawTrend: 0.4, rawBusinessValue: 0.4 },
  { term: "curl defining cream for beginners", rawVolume: 35, rawDifficulty: 38, rawCommercialIntent: 0.65, rawTrend: 0.55, rawBusinessValue: 0.65 },
  { term: "is my daughter's hair curly or wavy", rawVolume: 20, rawDifficulty: 15, rawCommercialIntent: 0.1, rawTrend: 0.3, rawBusinessValue: 0.2 },
  { term: "wide tooth comb for wet hair", rawVolume: 15, rawDifficulty: 18, rawCommercialIntent: 0.55, rawTrend: 0.35, rawBusinessValue: 0.45 },
  { term: "curly hair breakage prevention tips", rawVolume: 40, rawDifficulty: 28, rawCommercialIntent: 0.25, rawTrend: 0.6, rawBusinessValue: 0.5 },
  { term: "dermatologist approved kids hair products", rawVolume: 30, rawDifficulty: 42, rawCommercialIntent: 0.6, rawTrend: 0.45, rawBusinessValue: 0.75 },
  { term: "how often should tweens wash curly hair", rawVolume: 22, rawDifficulty: 22, rawCommercialIntent: 0.15, rawTrend: 0.4, rawBusinessValue: 0.3 },
  { term: "3a vs 3b vs 3c curl pattern chart", rawVolume: 18, rawDifficulty: 25, rawCommercialIntent: 0.1, rawTrend: 0.5, rawBusinessValue: 0.25 },
  { term: "gift set for curly haired tween", rawVolume: 28, rawDifficulty: 33, rawCommercialIntent: 0.85, rawTrend: 0.7, rawBusinessValue: 0.8 },
] as const;

export const DEMO_COMPETITORS = [
  { name: "Rivalia", domain: "rivalia.demo.invalid" },
  { name: "Glowmane", domain: "glowmane.demo.invalid" },
  { name: "Silkcurl Co", domain: "silkcurlco.demo.invalid" },
];

/**
 * Article topics for the pipeline, one per demo article. `targetState`
 * drives what scripts/seed.ts does after the pipeline completes (leave
 * as draft, advance to review/approved, or publish). The `needsReview`
 * flag is the ONE article seeded with a deliberately unresolved claim,
 * to prove the Phase 8 publish gate blocks it — see DATABASE.md /
 * AI_SCORING.md publish-gate section.
 */
export const DEMO_ARTICLE_TOPICS = [
  { keywordTerm: "detangling brush for curly hair", targetState: "published" as const },
  { keywordTerm: "best leave-in conditioner for kids curly hair", targetState: "published" as const },
  { keywordTerm: "how to detangle curly hair without breakage", targetState: "approved" as const },
  { keywordTerm: "curly hair routine for tweens", targetState: "review" as const },
  { keywordTerm: "sulfate free shampoo for kids", targetState: "draft" as const },
  { keywordTerm: "dermatologist approved kids hair products", targetState: "blocked_unresolved_claim" as const },
];

export const DEMO_AI_PROMPTS = [
  "best detangling brush for curly hair kids",
  "sulfate free shampoo recommendations for tweens",
  "how to take care of curly hair for beginners",
];
