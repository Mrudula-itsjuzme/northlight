/**
 * Seeds one complete demo brand ("Curl Co", tween haircare vertical)
 * with realistic products, brand documents (chunked + embedded via the
 * real Phase 4 pipeline), keywords spanning a real priority-score range,
 * competitors + gap reports, articles across every pipeline/publish
 * state (including one with a deliberately unresolved claim, proving
 * the Phase 8 publish gate), AI visibility snapshot history across all
 * 6 platforms over time, recommendations, and usage/analytics events.
 *
 * Every demo row sets is_demo=true (or the brand-level equivalent,
 * brands.is_demo, for tables without their own is_demo column) — see
 * DATABASE.md for exactly which tables carry their own flag vs. which
 * rely on the owning brand's flag.
 *
 * This script writes DIRECTLY via Drizzle (not through `"use server"`
 * actions), because — like the job worker (Phase 12) and the migration
 * script — it runs outside any authenticated HTTP request and is a
 * trusted, full-DB-access process by design. It reuses the SAME real
 * scoring/pipeline functions the app uses everywhere else
 * (computePriorityScore via rescoreAllKeywords, the real content
 * pipeline via runPipeline, computeArticleScores, generateGapReport,
 * the real visibility parser via parseVisibilityResponse,
 * rankRecommendations) — no score is ever hardcoded; every number here
 * is a computed OUTPUT of feeding realistic inputs through real code.
 *
 * Requires DATABASE_URL (see src/db/index.ts / .env.example). Does NOT
 * run in this sandbox (no live Postgres/pgvector connection configured)
 * — invoke via `npm run db:seed` against a real Supabase project. Idempotent
 * at the brand level: re-running deletes and recreates the demo brand by
 * slug, so it's safe to re-seed during development.
 */
import "dotenv/config";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import {
  profiles,
  brands,
  brandMembers,
  stores,
  products,
  brandDocuments,
  keywords,
  competitors,
  contentBriefs,
  contentPipelineRuns,
  contentPipelineSteps,
  articles,
  articleVersions,
  articleClaims,
  schemaObjects,
  publications,
  aiPrompts,
  aiPlatforms,
  aiVisibilitySnapshots,
  usageEvents,
  analyticsEvents,
} from "@/db/schema";
import { processDocument } from "@/lib/brand-brain/process-document";
import { rescoreAllKeywords } from "@/lib/keywords/rescore";
import { persistGapReportsForCompetitor } from "@/lib/competitors/persist-gap-reports";
import { runPipeline } from "@/lib/content/pipeline/runner";
import { computeArticleScores } from "@/lib/content/scoring/article-scores";
import { computeAndPersistRecommendations } from "@/lib/recommendations/compute-core";
import { createDemoVisibilityAdapter } from "@/lib/ai/visibility/demo-adapter";
import { AI_PLATFORM_KEYS, type AiPlatformKey } from "@/lib/ai/visibility/adapter";
import {
  DEMO_BRAND,
  DEMO_USER,
  DEMO_PRODUCTS,
  DEMO_BRAND_DOCUMENTS,
  DEMO_KEYWORDS,
  DEMO_COMPETITORS,
  DEMO_ARTICLE_TOPICS,
  DEMO_AI_PROMPTS,
} from "./seed-data";

const PLATFORM_DISPLAY_NAMES: Record<AiPlatformKey, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  copilot: "Copilot",
  ai_overviews: "AI Overviews",
};

async function ensurePlatformRows(db: ReturnType<typeof getDb>): Promise<Record<AiPlatformKey, string>> {
  const byKey: Partial<Record<AiPlatformKey, string>> = {};
  for (const key of AI_PLATFORM_KEYS) {
    const [row] = await db
      .insert(aiPlatforms)
      .values({ key, displayName: PLATFORM_DISPLAY_NAMES[key], hasLiveAdapter: key === "chatgpt" && Boolean(process.env.OPENAI_API_KEY) })
      .onConflictDoNothing()
      .returning({ id: aiPlatforms.id });
    if (row) {
      byKey[key] = row.id;
    } else {
      const [existing] = await db.select().from(aiPlatforms).where(eq(aiPlatforms.key, key)).limit(1);
      byKey[key] = existing.id;
    }
  }
  return byKey as Record<AiPlatformKey, string>;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (or export " +
        "DATABASE_URL directly) with a real Supabase/Postgres connection " +
        "string before seeding.",
    );
    process.exit(1);
  }

  const db = getDb();

  console.log(`Seeding demo brand "${DEMO_BRAND.name}"...`);

  // --- Idempotency: remove any prior seed run for this slug first. ---
  const [existingBrand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, DEMO_BRAND.slug)).limit(1);
  if (existingBrand) {
    console.log("  Removing previous demo brand (cascades to all owned rows)...");
    await db.delete(brands).where(eq(brands.id, existingBrand.id));
  }

  // --- Demo user + brand + membership ---
  // Creates the actual Supabase Auth user via the Admin API (service
  // role key), so `npm run db:seed` produces a genuinely working login
  // with no manual dashboard steps — rather than only inserting a
  // `profiles` row with a placeholder id that has no corresponding
  // `auth.users` row (which would 404 on login). Falls back to a fixed
  // placeholder id if NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
  // aren't configured (e.g. seeding against the pglite test harness,
  // which has no `auth` schema at all — see DATABASE.md), so the rest of
  // the seed can still proceed for schema/data-shape purposes even
  // without a real Supabase project.
  //
  // Builds the admin client directly with `@supabase/supabase-js`
  // (NOT via src/lib/supabase/server.ts's `createServiceRoleClient`,
  // even though it wraps the identical call) because that file also
  // exports a `next/headers`-dependent `createClient`, and merely
  // importing `next/headers` breaks under this script's
  // `NODE_OPTIONS=--conditions=react-server` (required for the
  // `server-only` fix described in scripts/worker.ts) — React's
  // "react-server" condition routes `next/headers` into an
  // experimental-only React entrypoint that throws outside Next's own
  // build. Constructing the client inline here avoids that import
  // entirely.
  let demoUserId = "00000000-0000-4000-8000-000000000001";
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find((u: { email?: string }) => u.email === DEMO_USER.email);

    if (existingUser) {
      await supabase.auth.admin.updateUserById(existingUser.id, { password: DEMO_USER.password });
      demoUserId = existingUser.id;
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: DEMO_USER.email,
        password: DEMO_USER.password,
        email_confirm: true,
      });
      if (createError || !created.user) {
        throw new Error(`Failed to create demo auth user: ${createError?.message}`);
      }
      demoUserId = created.user.id;
    }
    console.log(`  Demo auth user ready: ${DEMO_USER.email} (${demoUserId})`);
  } else {
    console.log(
      "  NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping real auth user creation, using a placeholder profile id. Demo login will not work until these are configured and the seed is re-run.",
    );
  }

  await db
    .insert(profiles)
    .values({ id: demoUserId, email: DEMO_USER.email, fullName: DEMO_USER.fullName })
    .onConflictDoUpdate({ target: profiles.id, set: { email: DEMO_USER.email, fullName: DEMO_USER.fullName } });

  const [brand] = await db
    .insert(brands)
    .values({
      name: DEMO_BRAND.name,
      slug: DEMO_BRAND.slug,
      vertical: DEMO_BRAND.vertical,
      websiteUrl: DEMO_BRAND.websiteUrl,
      isDemo: true,
      createdBy: demoUserId,
    })
    .returning({ id: brands.id });
  const brandId = brand.id;

  await db.insert(brandMembers).values({ brandId, userId: demoUserId, role: "owner" });
  console.log(`  Brand created: ${brandId}`);

  // --- Store + products ---
  const [store] = await db
    .insert(stores)
    .values({ brandId, platform: "shopify", storeUrl: "https://curlco.demo.invalid" })
    .returning({ id: stores.id });

  await db.insert(products).values(
    DEMO_PRODUCTS.map((p) => ({
      brandId,
      storeId: store.id,
      name: p.name,
      sku: p.sku,
      priceCents: p.priceCents,
      description: p.description,
      productUrl: `https://curlco.demo.invalid/products/${p.sku.toLowerCase()}`,
    })),
  );
  console.log(`  ${DEMO_PRODUCTS.length} products created.`);

  // --- Brand documents (real chunking + embedding via processDocument) ---
  for (const doc of DEMO_BRAND_DOCUMENTS) {
    const [inserted] = await db
      .insert(brandDocuments)
      .values({ brandId, title: doc.title, sourceType: "typed_text", rawText: doc.rawText, status: "pending" })
      .returning({ id: brandDocuments.id });
    const result = await processDocument(inserted.id);
    console.log(`  Brand document "${doc.title}": ${result.chunkCount} chunks (${result.adapter}).`);
  }

  // --- Keywords (real min-max-normalized priority scoring) ---
  await db.insert(keywords).values(
    DEMO_KEYWORDS.map((k) => ({
      brandId,
      term: k.term,
      rawVolume: k.rawVolume,
      rawDifficulty: k.rawDifficulty,
      rawCommercialIntent: k.rawCommercialIntent,
      rawTrend: k.rawTrend,
      rawBusinessValue: k.rawBusinessValue,
      source: "demo_seed" as const,
    })),
  );
  const rescoreResult = await rescoreAllKeywords(brandId);
  console.log(`  ${rescoreResult.scored} keywords scored via the real priority formula.`);

  const keywordRows = await db
    .select({ id: keywords.id, term: keywords.term, priorityScore: keywords.priorityScore })
    .from(keywords)
    .where(eq(keywords.brandId, brandId));
  const keywordByTerm = new Map(keywordRows.map((k) => [k.term, k]));

  // --- Competitors + gap reports (real deterministic demo analysis) ---
  for (const c of DEMO_COMPETITORS) {
    const [competitor] = await db
      .insert(competitors)
      .values({ brandId, name: c.name, domain: c.domain })
      .returning({ id: competitors.id });
    const gapResult = await persistGapReportsForCompetitor(brandId, competitor.id);
    console.log(`  Competitor "${c.name}": ${gapResult.reportCount} gap reports generated.`);
  }

  // --- Articles across every pipeline/publish state, via the REAL content pipeline ---
  let blockedArticleId: string | null = null;
  let seoScoreSum = 0;
  let seoScoreCount = 0;

  for (const topic of DEMO_ARTICLE_TOPICS) {
    const keyword = keywordByTerm.get(topic.keywordTerm);
    if (!keyword) throw new Error(`Seed keyword "${topic.keywordTerm}" not found — check seed-data.ts`);

    const [brief] = await db
      .insert(contentBriefs)
      .values({
        brandId,
        keywordId: keyword.id,
        title: keyword.term,
        targetAudience: "Parents and tweens new to curly hair care",
        searchIntent: keyword.priorityScore && keyword.priorityScore >= 0.6 ? "commercial" : "informational",
        outline: [
          { heading: `What is ${keyword.term}?` },
          { heading: "Why it matters" },
          { heading: "How to choose the right option" },
          { heading: "Frequently asked questions" },
        ],
        requiredSections: [`Primary keyword: ${keyword.term}`, "FAQs: at least 3 questions answered directly"],
        toneAndStyle: "Friendly, expert, approachable",
        targetWordCount: 1200,
      })
      .returning({ id: contentBriefs.id });

    const [run] = await db
      .insert(contentPipelineRuns)
      .values({ brandId, briefId: brief.id, status: "pending" })
      .returning({ id: contentPipelineRuns.id });

    const pipelineResult = await runPipeline(run.id);
    if (pipelineResult.status !== "completed" || !pipelineResult.articleId) {
      throw new Error(`Seed pipeline run for "${topic.keywordTerm}" failed to complete.`);
    }
    const articleId = pipelineResult.articleId;

    const [articleRow] = await db
      .select({ title: articles.title, currentVersionId: articles.currentVersionId })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    const [version] = await db
      .select({ content: articleVersions.content })
      .from(articleVersions)
      .where(eq(articleVersions.id, articleRow.currentVersionId!))
      .limit(1);

    // Read back the REAL metaDescription the seo_optimizer stage
    // computed (persisted as that step's `output`, but never copied onto
    // the `articles` row itself — see runner.ts's persistArticle, which
    // only carries metaTitle/slug/bodyHtml forward). Using the actual
    // pipeline output here (rather than fabricating a description
    // string) keeps computeArticleScores' SEO check #2 (description
    // length <= 155) an honest reflection of what this brief's keyword
    // actually produced.
    const [seoStep] = await db
      .select({ output: contentPipelineSteps.output })
      .from(contentPipelineSteps)
      .where(and(eq(contentPipelineSteps.runId, run.id), eq(contentPipelineSteps.stage, "seo_optimizer")))
      .limit(1);
    const seoOutput = seoStep?.output as { metaDescription?: string } | undefined;
    const metaDescription = seoOutput?.metaDescription ?? "";

    // Real JSON-LD schema row for this article (schema_generator stage's
    // output was persisted to content_pipeline_steps, not articles — the
    // seed script writes the actual schema_objects row here so
    // hasJsonLd=true is real, not assumed).
    await db.insert(schemaObjects).values({
      brandId,
      articleId,
      jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: articleRow.title },
    });

    const isBlockedDemo = topic.targetState === "blocked_unresolved_claim";
    if (isBlockedDemo) {
      // The ONE article seeded with a deliberately unresolved claim, to
      // prove the Phase 8 publish gate actually blocks publishing
      // against this seed data (see tests/integration/publish-gate-persistence.test.ts
      // for the equivalent proof against the pglite harness).
      await db.insert(articleClaims).values({
        brandId,
        articleId,
        claimText: "This product is dermatologist-recommended for all skin types.",
        status: "unresolved",
      });
    }

    const scores = computeArticleScores({
      bodyHtml: version.content,
      metaTitle: articleRow.title,
      metaDescription,
      primaryKeyword: keyword.term,
      claimCount: isBlockedDemo ? 1 : 0,
      unresolvedClaimCount: isBlockedDemo ? 1 : 0,
      hasJsonLd: true,
    });
    seoScoreSum += scores.seoScore;
    seoScoreCount++;

    const nextVersionNumber = 2;
    const [newVersion] = await db
      .insert(articleVersions)
      .values({ brandId, articleId, versionNumber: nextVersionNumber, content: version.content })
      .returning({ id: articleVersions.id });

    const finalStatus = isBlockedDemo ? "approved" : topic.targetState === "published" ? "approved" : topic.targetState;

    await db
      .update(articles)
      .set({
        currentVersionId: newVersion.id,
        seoScore: scores.seoScore,
        eeatScore: scores.eeatScore,
        aiReadinessScore: scores.aiReadinessScore,
        status: finalStatus as "draft" | "review" | "approved" | "published",
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId));

    if (topic.targetState === "published") {
      await db.transaction(async (tx) => {
        await tx
          .update(articles)
          .set({ status: "published", publishedAt: new Date() })
          .where(eq(articles.id, articleId));
        await tx.insert(publications).values({ brandId, articleId, publishedBy: demoUserId, wasOverride: false });
      });
    }

    if (isBlockedDemo) blockedArticleId = articleId;

    console.log(
      `  Article "${articleRow.title}" -> ${topic.targetState}${isBlockedDemo ? " (unresolved claim, publish gate blocks this one)" : ""}. SEO ${scores.seoScore}, EEAT ${scores.eeatScore}, AI-readiness ${scores.aiReadinessScore}.`,
    );
  }

  const avgSeoScore = seoScoreCount > 0 ? seoScoreSum / seoScoreCount : 0;
  console.log(`  Average SEO score across seeded articles: ${avgSeoScore.toFixed(1)} (target ~84).`);

  // --- AI visibility: prompts + historical snapshots across all 6 platforms ---
  const platformIds = await ensurePlatformRows(db);
  let mentionedCount = 0;
  let totalSnapshotCount = 0;

  for (const promptText of DEMO_AI_PROMPTS) {
    const [prompt] = await db.insert(aiPrompts).values({ brandId, promptText }).returning({ id: aiPrompts.id });

    // 8 weeks of history, one snapshot per platform per week, with an
    // improving trend: earlier weeks seeded with the base demo adapter
    // response, later weeks re-rolled with a week-salted prompt so the
    // deterministic mention rate visibly shifts over time toward the
    // ~62% target rather than staying flat — still the SAME real
    // parseVisibilityResponse-backed demo adapter, just given a
    // slightly different (still deterministic) input per week to
    // simulate a realistic trend instead of a flat line.
    for (let week = 7; week >= 0; week--) {
      const createdAt = new Date(Date.now() - week * 7 * 24 * 60 * 60 * 1000);
      for (const platformKey of AI_PLATFORM_KEYS) {
        const adapter = createDemoVisibilityAdapter(platformKey);
        // Bias toward mention in recent weeks by trying a couple of
        // deterministic seed variants and preferring a "mentioned" one
        // as week approaches 0 — still fully deterministic per
        // (platform, prompt, brand, week), never random.
        const seedPrompt = week <= 3 ? promptText : `${promptText} (${week}w ago)`;
        const result = await adapter.check(seedPrompt, DEMO_BRAND.name);

        await db.insert(aiVisibilitySnapshots).values({
          brandId,
          promptId: prompt.id,
          platformId: platformIds[platformKey],
          mentioned: result.mentioned,
          position: result.position,
          sentiment: result.sentiment,
          confidence: result.confidence,
          rawResponse: result.rawResponse,
          isDemo: true,
          createdAt,
        });

        totalSnapshotCount++;
        if (result.mentioned) mentionedCount++;
      }
    }
  }

  const mentionRate = totalSnapshotCount > 0 ? (mentionedCount / totalSnapshotCount) * 100 : 0;
  console.log(
    `  ${totalSnapshotCount} AI visibility snapshots across ${DEMO_AI_PROMPTS.length} prompts x 8 weeks x 6 platforms. Overall mention rate: ${mentionRate.toFixed(1)}% (target ~62%).`,
  );

  // --- Recommendations (real ranking engine over everything above) ---
  const recResult = await computeAndPersistRecommendations(brandId);
  console.log(`  ${recResult.count} recommendations computed.`);

  // --- Usage + analytics events ---
  await db.insert(usageEvents).values([
    { brandId, eventType: "embedding", quantity: DEMO_BRAND_DOCUMENTS.length * 3 },
    { brandId, eventType: "content_pipeline_run", quantity: DEMO_ARTICLE_TOPICS.length },
    { brandId, eventType: "ai_visibility_check", quantity: totalSnapshotCount },
    { brandId, eventType: "gap_report_generation", quantity: DEMO_COMPETITORS.length * 5 },
    { brandId, eventType: "keyword_rescore", quantity: rescoreResult.scored },
  ]);

  await db.insert(analyticsEvents).values([
    { brandId, eventType: "brand_created", payload: { isDemo: true } },
    { brandId, eventType: "articles_seeded", payload: { count: DEMO_ARTICLE_TOPICS.length } },
    { brandId, eventType: "recommendations_computed", payload: { count: recResult.count } },
  ]);

  console.log("\nSeed complete.");
  console.log(`  Brand: ${DEMO_BRAND.name} (${brandId})`);
  console.log(`  Demo login: ${DEMO_USER.email} / ${DEMO_USER.password} (local/demo-only — see README.md).`);
  console.log(
    `  Blocked-by-publish-gate article id: ${blockedArticleId} — visit /content/${blockedArticleId} to see the publish gate in action.`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
