"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, articleVersions, articleClaims, schemaObjects, publications } from "@/db/schema";
import { requireRole, requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import { canPublish, type ClaimForGate } from "@/lib/content/publish-gate";
import { computeArticleScores } from "@/lib/content/scoring/article-scores";
import type { ActionResult } from "@/lib/brands/types";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

type ArticleState = "draft" | "review" | "approved" | "published";

const ALLOWED_TRANSITIONS: Record<ArticleState, ArticleState[]> = {
  draft: ["review"],
  review: ["draft", "approved"],
  approved: ["review", "published"],
  published: [],
};

/**
 * Autosave: creates a new `article_versions` row (never overwrites a
 * prior version — full history is preserved) and recomputes SEO/EEAT/
 * AI-readiness scores from the new content. Intended to be called from a
 * debounced client-side effect, not on every keystroke — the debouncing
 * happens client-side; this action itself is a plain, idempotent-per-call
 * server action.
 */
export async function autosaveArticleContent(
  brandId: string,
  articleId: string,
  content: string,
  authorId: string,
): Promise<ActionResult<{ versionId: string }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const [article] = await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, articleId), eq(articles.brandId, brandId)))
      .limit(1);
    if (!article) return { ok: false, error: "Article not found." };

    const [latestVersion] = await db
      .select({ versionNumber: articleVersions.versionNumber })
      .from(articleVersions)
      .where(eq(articleVersions.articleId, articleId))
      .orderBy(desc(articleVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const claims = await db
      .select({ status: articleClaims.status })
      .from(articleClaims)
      .where(eq(articleClaims.articleId, articleId));
    const unresolvedClaimCount = claims.filter((c) => c.status === "unresolved").length;

    const [existingSchema] = await db
      .select({ id: schemaObjects.id })
      .from(schemaObjects)
      .where(eq(schemaObjects.articleId, articleId))
      .limit(1);

    const scores = computeArticleScores({
      bodyHtml: content,
      metaTitle: article.title,
      metaDescription: "",
      primaryKeyword: article.title,
      claimCount: claims.length,
      unresolvedClaimCount,
      hasJsonLd: Boolean(existingSchema),
    });

    const [version] = await db
      .insert(articleVersions)
      .values({ brandId, articleId, versionNumber: nextVersionNumber, content, authorId })
      .returning({ id: articleVersions.id });

    await db
      .update(articles)
      .set({
        currentVersionId: version.id,
        seoScore: scores.seoScore,
        eeatScore: scores.eeatScore,
        aiReadinessScore: scores.aiReadinessScore,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId));

    revalidatePath(`/content/${articleId}`);
    return { ok: true, data: { versionId: version.id } };
  } catch (err) {
    return toActionError(err, "Failed to autosave.");
  }
}

/** State-machine-gated status transition: draft -> review -> approved -> published (publish uses publishArticle instead, since it needs the gate). */
export async function transitionArticleState(
  brandId: string,
  articleId: string,
  nextState: Exclude<ArticleState, "published">,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const [article] = await db
      .select({ status: articles.status })
      .from(articles)
      .where(and(eq(articles.id, articleId), eq(articles.brandId, brandId)))
      .limit(1);
    if (!article) return { ok: false, error: "Article not found." };

    const currentState = article.status as ArticleState;
    if (!ALLOWED_TRANSITIONS[currentState].includes(nextState)) {
      return {
        ok: false,
        error: `Cannot move an article from "${currentState}" to "${nextState}".`,
      };
    }

    await db
      .update(articles)
      .set({ status: nextState, updatedAt: new Date() })
      .where(eq(articles.id, articleId));

    revalidatePath(`/content/${articleId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to change article status.");
  }
}

/** Marks a claim resolved with a note. Editor+. */
export async function resolveClaim(
  brandId: string,
  claimId: string,
  resolutionNote: string,
  resolvedBy: string,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    await db
      .update(articleClaims)
      .set({ status: "resolved", resolutionNote, resolvedBy, resolvedAt: new Date() })
      .where(and(eq(articleClaims.id, claimId), eq(articleClaims.brandId, brandId)));

    revalidatePath("/content");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to resolve claim.");
  }
}

/**
 * Owner-only override for a claim: records status='overridden' plus the
 * full audit trail (override_by/override_reason/override_at). Enforced
 * server-side via requireRoleOrThrow("owner") — a non-owner's attempt
 * throws a RoleError and no row is changed, which is exactly what
 * publish-gate.test.ts's "non-owner override attempt" scenario relies on
 * being true end-to-end.
 */
export async function overrideClaim(
  brandId: string,
  claimId: string,
  overrideReason: string,
  overrideBy: string,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "owner");
    const db = getDb();
    await db
      .update(articleClaims)
      .set({ status: "overridden", overrideReason, overrideBy, overrideAt: new Date() })
      .where(and(eq(articleClaims.id, claimId), eq(articleClaims.brandId, brandId)));

    revalidatePath("/content");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to override claim.");
  }
}

/**
 * Publishes an article: re-checks the real publish gate server-side
 * (never trusts the client's belief that publish is allowed), using the
 * caller's actual role and the article's actual claim rows. Blocks with
 * the gate's own reason message if not allowed. On success, transitions
 * to `published`, sets `published_at`, and records a `publications` row
 * (audit trail of who published and whether it was via an override).
 */
export async function publishArticle(brandId: string, articleId: string): Promise<ActionResult> {
  const roleResult = await requireRole(brandId, "editor");
  if (!roleResult.ok) {
    return { ok: false, error: roleResult.error };
  }

  const db = getDb();

  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.brandId, brandId)))
    .limit(1);
  if (!article) return { ok: false, error: "Article not found." };

  if (article.status !== "approved") {
    return { ok: false, error: `Article must be "approved" before publishing (currently "${article.status}").` };
  }

  const claimRows = await db
    .select({ status: articleClaims.status })
    .from(articleClaims)
    .where(eq(articleClaims.articleId, articleId));

  const claims: ClaimForGate[] = claimRows.map((c) => ({ status: c.status }));
  const wasOverride = claims.some((c) => c.status === "overridden");
  const gateResult = canPublish(claims, roleResult.role, wasOverride);

  if (!gateResult.canPublish) {
    return { ok: false, error: gateResult.reason };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(articles)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(articles.id, articleId));

    await tx.insert(publications).values({
      brandId,
      articleId,
      publishedBy: roleResult.userId,
      wasOverride,
    });
  });

  revalidatePath(`/content/${articleId}`);
  return { ok: true, data: undefined };
}

export type ArticleWithVersion = {
  id: string;
  title: string;
  slug: string;
  status: string;
  seoScore: number | null;
  eeatScore: number | null;
  aiReadinessScore: number | null;
  content: string;
  jsonLd: Record<string, unknown> | null;
};

export async function getArticleForEditor(
  brandId: string,
  articleId: string,
): Promise<ActionResult<ArticleWithVersion>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();

    const [article] = await db
      .select()
      .from(articles)
      .where(and(eq(articles.id, articleId), eq(articles.brandId, brandId)))
      .limit(1);
    if (!article) return { ok: false, error: "Article not found." };

    let content = "";
    if (article.currentVersionId) {
      const [version] = await db
        .select({ content: articleVersions.content })
        .from(articleVersions)
        .where(eq(articleVersions.id, article.currentVersionId))
        .limit(1);
      content = version?.content ?? "";
    }

    const [schemaObj] = await db
      .select({ jsonLd: schemaObjects.jsonLd })
      .from(schemaObjects)
      .where(eq(schemaObjects.articleId, articleId))
      .orderBy(desc(schemaObjects.createdAt))
      .limit(1);

    return {
      ok: true,
      data: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        status: article.status,
        seoScore: article.seoScore,
        eeatScore: article.eeatScore,
        aiReadinessScore: article.aiReadinessScore,
        content,
        jsonLd: (schemaObj?.jsonLd as Record<string, unknown>) ?? null,
      },
    };
  } catch (err) {
    return toActionError(err, "Failed to load article.");
  }
}

export type ArticleClaimItem = {
  id: string;
  claimText: string;
  status: string;
  resolutionNote: string | null;
  overrideReason: string | null;
};

export async function listArticleClaims(
  brandId: string,
  articleId: string,
): Promise<ActionResult<ArticleClaimItem[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const rows = await db
      .select()
      .from(articleClaims)
      .where(and(eq(articleClaims.articleId, articleId), eq(articleClaims.brandId, brandId)))
      .orderBy(asc(articleClaims.createdAt));

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        claimText: r.claimText,
        status: r.status,
        resolutionNote: r.resolutionNote,
        overrideReason: r.overrideReason,
      })),
    };
  } catch (err) {
    return toActionError(err, "Failed to list claims.");
  }
}
