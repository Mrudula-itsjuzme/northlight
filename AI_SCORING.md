# AI Scoring & Heuristics Methodology

This document precisely describes every scoring/parsing formula and
heuristic in Northlight, matching the actual implementation in
`src/lib/**`. It is built up incrementally as each phase lands (see
`IMPLEMENTATION_PLAN.md`'s status log for what's implemented so far) —
sections are added as their corresponding code ships, not written ahead of
the code.

## Keyword priority score (Phase 5)

Implemented in `src/lib/scoring/priority.ts`.

```
priority = 0.30 * normalizedVolume
         + 0.25 * (1 - normalizedDifficulty)
         + 0.20 * commercialIntent
         + 0.15 * trend
         + 0.10 * businessValue
```

- `normalizedVolume` and `normalizedDifficulty` are min-max normalized
  against the brand's own keyword set: `(value - min) / (max - min)`,
  clamped implicitly to `[0, 1]` since `value` is always within
  `[min, max]` by construction. If every keyword in the set has the same
  raw value (`min === max`), normalization returns `0.5` (a neutral
  midpoint) rather than dividing by zero.
- `commercialIntent`, `trend`, and `businessValue` are already expressed
  on a `[0, 1]` scale as raw inputs — they are qualitative/derived
  signals, not absolute counts, so no min-max normalization is applied to
  them.
- The weights sum to exactly `1.0`.

### Worked example

Three keywords, volume range `[1000, 5000]`, difficulty range `[20, 60]`:

| Keyword | rawVolume | rawDifficulty | commercialIntent | trend | businessValue | normalizedVolume | normalizedDifficulty | priorityScore |
|---|---|---|---|---|---|---|---|---|
| A | 1000 | 20 | 0.8 | 0.5 | 0.9 | 0.0 | 0.0 | **0.575** |
| B | 5000 | 60 | 0.3 | 0.2 | 0.4 | 1.0 | 1.0 | **0.430** |
| C | 3000 | 40 | 0.6 | 0.7 | 0.6 | 0.5 | 0.5 | **0.560** |

Keyword A: `0.30*0 + 0.25*(1-0) + 0.20*0.8 + 0.15*0.5 + 0.10*0.9`
`= 0 + 0.25 + 0.16 + 0.075 + 0.09 = 0.575`

Keyword B: `0.30*1 + 0.25*(1-1) + 0.20*0.3 + 0.15*0.2 + 0.10*0.4`
`= 0.30 + 0 + 0.06 + 0.03 + 0.04 = 0.43`

Keyword C: `0.30*0.5 + 0.25*0.5 + 0.20*0.6 + 0.15*0.7 + 0.10*0.6`
`= 0.15 + 0.125 + 0.12 + 0.105 + 0.06 = 0.56`

This exact fixture (asserted to 10 decimal places) lives in
`tests/unit/priority-scoring.test.ts`.

`keyword_scores` is an append-only history table (`formula_version`
column) — re-scoring never overwrites prior computed values, since the
normalization baseline shifts whenever the brand's keyword set changes.

## Keyword clustering (Phase 5)

Implemented in `src/lib/scoring/cluster.ts`. No ML model or embedding
call — deterministic greedy single-link clustering on Jaccard similarity
of each keyword's "significant tokens" (lowercased, non-alphanumeric
split, stopwords removed, length > 2). A keyword joins the first existing
cluster whose token set has Jaccard similarity `>= 0.2` (default
threshold) with it; otherwise it starts a new cluster. A cluster's name is
its longest member term.

## Demo embedding adapter (Phase 4)

Implemented in `src/lib/ai/embeddings.ts`'s `demoHashEmbedding`, used only
when `OPENAI_API_KEY` is not configured (the real adapter calls OpenAI's
`text-embedding-3-small` otherwise). NOT a real semantic embedding.

Method — the standard "hashing trick" (feature hashing) for bag-of-
features vectors:

1. Normalize the text (lowercase, collapse whitespace).
2. Extract features: every whitespace-delimited word token, plus every
   character trigram (3-character sliding window) of the padded text.
3. For each feature string, compute two independent FNV-1a hashes: one to
   pick a dimension index in `[0, 1536)`, one to pick a sign (`+1`/`-1`).
4. Accumulate the sign into that dimension for every occurrence of that
   feature across the whole text.
5. L2-normalize the resulting 1536-dimension vector.

Because two texts sharing a feature always hash that feature to the same
dimension with the same sign, texts with more lexical overlap reliably
produce a higher cosine similarity than unrelated texts — this property
is asserted directly in `tests/unit/embeddings.test.ts`. (An earlier
implementation attempt re-hashed the entire document per output dimension
with only the dimension index as a seed; a test proved that approach
produced no reliable similarity correlation, so it was replaced with the
method described here before it shipped.)

## Competitor gap analysis (Phase 6)

Implemented in `src/lib/competitors/gap-analysis.ts`. A deterministic,
non-LLM demo adapter — NOT a live crawl or model call. Seeded by
`brandId:competitorId:type` via FNV-1a, so the same brand/competitor/type
combination always produces the same findings and priority score (no
randomness between runs). Draws 2-4 findings from a fixed topic pool per
gap type (content/schema/faq/backlink/ai_citation), assigns each a
severity (low/medium/high, also seeded), and computes `priorityScore` as
the mean of severity weights (`low=0.2, medium=0.5, high=0.9`), rounded to
3 decimal places. The `ai_citation` type's descriptions always include an
explicit "this is a directional signal only, not an official citation
count" disclaimer.

## Content pipeline stages (Phase 7)

Implemented in `src/lib/content/pipeline/stages.ts`. All 8 stages
(Research, Strategy, Outline, Writer, Editor, SEO Optimizer, Fact Check,
Schema Generator) are deterministic, non-LLM functions — per the app's
constraint against calling a real external API without a credential, and
to keep pipeline runs fully exercisable/testable in a sandbox with no
OpenAI key. Each stage does real structured work from its typed input
(keyword-pattern-based content-type classification, outline-driven HTML
generation, whitespace-normalizing edits, meta-length-constrained SEO
fields, and a genuine fact-check heuristic checking whether each research
claim still appears in the final body) rather than fabricating output —
see `stages.ts`'s module doc comment for the full rationale.

## Article SEO / EEAT / AI-readiness scores (Phase 8)

Implemented in `src/lib/content/scoring/article-scores.ts`. All three
scores are 0-100, computed from simple auditable rules over the
article's own HTML/metadata — not an LLM judgment call, so the same
input always produces the same score.

**SEO score** — 5 checks, 20 points each:
1. Meta title present and ≤ 60 characters.
2. Meta description present and ≤ 155 characters.
3. Primary keyword appears in the meta title.
4. Primary keyword appears at least once in the body text.
5. Body contains at least one `<h2>` heading.

**EEAT score** (Experience/Expertise/Authoritativeness/Trust) — 4 checks,
25 points each:
1. Body word count ≥ 300.
2. Body contains a "why"/"how"/"what" pattern (explanatory structure
   signal).
3. Zero unresolved claims.
4. No claims recorded at all, OR zero unresolved claims (redundant with
   check 3 at the whole-article level, rewarding "fact-checked and
   clean" articles at full weight).

**AI-readiness score** (directional heuristic for how well-structured
content is for generative-AI extraction — never a guarantee of actual AI
citation; see the AI Visibility methodology once Phase 9 lands) — 4
checks, 25 points each:
1. Valid JSON-LD schema present.
2. Body contains an FAQ-style heading.
3. Body has at least 2 `<h2>`/`<h3>` headings.
4. Meta description is present.

## Publish gate (Phase 8)

Implemented in `src/lib/content/publish-gate.ts`'s pure `canPublish`
function: publish is allowed iff there are zero `unresolved`
`article_claims` rows, OR the caller is an `owner` AND an override has
actually been recorded (`overrideRecorded === true`, meaning the caller
already wrote the `article_claims.status = 'overridden'` audit row with
`override_by`/`override_reason`/`override_at` populated). A non-owner can
never use the override path regardless of intent. Exhaustively tested in
`tests/unit/publish-gate.test.ts` (blocked/unblocked/non-owner-override/
owner-override/audit-field scenarios) and proven against real persisted
`article_claims` rows in `tests/integration/publish-gate-persistence.test.ts`.

## AI Visibility parsing methodology (Phase 9)

Implemented in `src/lib/ai/visibility/parse.ts`'s `parseVisibilityResponse`,
shared identically by the demo adapter (`demo-adapter.ts`) and the one
real adapter (`openai-adapter.ts`, ChatGPT only, used only when
`OPENAI_API_KEY` is configured — every other platform is always demo,
per the plan's single-provider constraint).

**IMPORTANT — directional only, never an official citation count.**
Every value below reflects this app's own text-parsing heuristic applied
to one response at one point in time. It is not sourced from any
platform's official API for citations/mentions (no such API is used or
exists for most of these platforms), it is not a guarantee of future
behavior, and a "position" is only ever relative to a single response's
own ordering, not a ranking against the real world. The UI states this
explicitly wherever visibility data is shown.

Given raw response text and a brand name:

1. **Mentioned**: word-boundary (not naive substring) case-insensitive
   match of the brand name in the response text. Word-boundary matching
   is required — an earlier naive `indexOf` implementation incorrectly
   matched "Curl Co" inside unrelated text like "Silkcurl Co", a bug
   caught by `tests/unit/visibility-parse.test.ts` before it shipped and
   fixed by anchoring the match on non-alphanumeric boundaries.
2. **Position**: if not mentioned, `null`. If mentioned, look for the
   nearest preceding numbered-list marker (`N.` or `N)`) before the
   mention and use that number; if none is found (e.g. the brand is
   mentioned in prose, not a list), `null`.
3. **Sentiment**: scan a ±100-character window around the mention for a
   fixed list of positive words (best, excellent, great, top,
   recommended, trusted, favorite, loved, outstanding) and negative words
   (worst, avoid, poor, disappointing, overpriced, unreliable,
   complaints). More positive hits → `positive`; more negative hits →
   `negative`; equal (including zero-zero) → `neutral`. Not mentioned →
   `unknown`.
4. **Confidence** (0-1, the PARSER's own extraction confidence, not the
   platform's): starts at 0.5 when mentioned; +0.25 if a list position
   was found; +0.25 if sentiment word hits were non-tied (a clear
   positive or negative signal, not silence or a tie), capped at 1.0. A
   clean non-mention (no ambiguity about absence) is reported at a fixed
   0.9 confidence.

## Recommendation ranking (Phase 10)

Implemented in `src/lib/recommendations/rank.ts`'s pure `rankRecommendations`
function — no LLM call, fully deterministic, so the same input signals
always produce the same ranked output (exhaustively fixture-tested in
`tests/unit/recommendation-rank.test.ts`).

**Inputs** (gathered by `src/lib/recommendations/compute-core.ts` from
real, already-persisted rows — never fabricated):

- `keywords`: `{ keywordId, term, priorityScore }` from the `keywords`
  table (see the priority formula above).
- `gaps`: `{ competitorId, competitorName, type, priorityScore,
  findingTitle }` from `gap_reports` joined to `competitors`.
- `content`: `{ articleId, title, status, seoScore, eeatScore,
  aiReadinessScore }` from `articles`.
- `visibility`: `{ promptId, promptText, platformDisplayName, mentioned,
  sentiment }` from `ai_visibility_snapshots` joined to `ai_prompts` and
  `ai_platforms`.

**Per-source inclusion rule and base score** (each source's base score is
normalized to `[0, 1]` before weighting):

| Source | Included when | Base score |
|---|---|---|
| Keyword | `priorityScore >= 0.5` | `priorityScore` itself |
| Competitor gap | always (every gap report row) | `priorityScore` itself |
| Content | `status !== 'published'` AND average of the 3 non-null scores `< 80` (0-100 scale) | `(100 - avgScore) / 100` — a bigger quality gap ranks higher |
| Visibility | `>= 50%` of a prompt's platform snapshots have `mentioned = false` | `notMentionedCount / totalSnapshots` for that prompt |

**Final rank score**:

```
rankScore = baseScore * SOURCE_WEIGHT[sourceType]

SOURCE_WEIGHTS = { keyword: 0.30, competitor: 0.30, content: 0.20, visibility: 0.20 }
```

The 4 weights sum to exactly `1.0`, so a top-of-pool score (`baseScore =
1`) from any single source type is comparable in magnitude to any other
source's top-of-pool score. All recommendations from all 4 sources are
merged into one list and sorted by `rankScore` descending; exact ties are
broken by original generation order (keyword before competitor before
content before visibility) for deterministic, reproducible output.

**Impact label** (qualitative, derived from the SAME per-item base score
that produced its rankScore, not from the final weighted rankScore):
`>= 0.66` -> `"high"`, `>= 0.33` -> `"medium"`, else `"low"`.

**Confidence** (0-1, a fixed per-source-type constant reflecting how
directly measured vs. inferred that source's signal is): keyword `0.7`,
competitor gap `0.6` (demo-adapter-derived), content `0.8` (deterministic
formula, high confidence in the signal itself), visibility `0.5` (AI
visibility is directional only, per this document's earlier section —
lower confidence is intentional here).

### Worked example

Fixture from `tests/unit/recommendation-rank.test.ts`: one keyword
(priorityScore 0.8), one competitor gap (priorityScore 0.9), one
under-80-average article (seo/eeat/aiReadiness all 60), one visibility
prompt mentioned on 1 of 3 platforms.

| Source | Base score | Weight | rankScore |
|---|---|---|---|
| Competitor gap | 0.9 | 0.30 | **0.270** (highest) |
| Keyword | 0.8 | 0.30 | **0.240** |
| Visibility | 2/3 (not mentioned on 2 of 3) | 0.20 | **0.1333...** |
| Content | (100-60)/100 = 0.4 | 0.20 | **0.080** (lowest) |

Recommendations are persisted to the `recommendations` table with a full
recompute each time `computeRecommendations`/`compute_recommendations`
job runs (the prior set is deleted and replaced inside a transaction,
since ranking is relative to the CURRENT complete signal set — the same
approach Phase 5 uses for keyword-cluster recomputation), each row
carrying `title`/`reason`/`evidence`/`impact`/`confidence`/`action`/
`sourceSignal`/`rankScore`/`status`.
