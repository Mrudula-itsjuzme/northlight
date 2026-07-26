import "server-only";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, articleVersions, publications } from "@/db/schema";
import { getPublishingAdapter } from "./adapters";
import type { PublishingDestination, PublishOptions, PublishResult } from "./types";

export async function publishArticle(
  brandId: string,
  articleId: string,
  destination: PublishingDestination = "demo",
  options?: PublishOptions,
): Promise<{ publicationId: string; result: PublishResult }> {
  const db = getDb();

  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.brandId, brandId)))
    .limit(1);

  if (!article) {
    throw new Error(`Article ${articleId} not found for brand ${brandId}`);
  }

  const [version] = await db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId))
    .orderBy(desc(articleVersions.versionNumber))
    .limit(1);

  if (!version) {
    throw new Error(`No article version found for article ${articleId}`);
  }

  const idempotencyKey = options?.idempotencyKey ?? `${brandId}:${articleId}:${destination}`;

  // Check if a publication record already exists with this idempotency key
  let [existingPub] = await db
    .select()
    .from(publications)
    .where(eq(publications.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!existingPub) {
    [existingPub] = await db
      .insert(publications)
      .values({
        brandId,
        articleId,
        destination,
        targetUrl: options?.targetUrl ?? null,
        syncStatus: "syncing",
        idempotencyKey,
      })
      .returning();
  } else {
    await db
      .update(publications)
      .set({ syncStatus: "syncing" })
      .where(eq(publications.id, existingPub.id));
  }

  const adapter = getPublishingAdapter(destination);
  const result = await adapter.publish(
    {
      id: article.id,
      title: article.title,
      slug: article.slug,
      contentHtml: version.content,
    },
    options,
  );

  await db
    .update(publications)
    .set({
      syncStatus: result.syncStatus,
      externalId: result.externalId || null,
      publishedUrl: result.publishedUrl || null,
      errorMessage: result.errorMessage || null,
      lastSyncAt: new Date(),
      publishedAt: result.syncStatus === "published" ? new Date() : null,
    })
    .where(eq(publications.id, existingPub.id));

  if (result.syncStatus === "published") {
    await db
      .update(articles)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(articles.id, articleId));
  }

  return {
    publicationId: existingPub.id,
    result,
  };
}
