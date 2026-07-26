import "server-only";
import type {
  PublishingAdapter,
  PublishingDestination,
  ArticleToPublish,
  PublishOptions,
  PublishResult,
} from "./types";

export class DemoPublishingAdapter implements PublishingAdapter {
  readonly destination: PublishingDestination = "demo";

  async publish(article: ArticleToPublish): Promise<PublishResult> {
    const externalId = `pub-demo-${article.id.slice(0, 8)}`;
    const publishedUrl = `https://example.com/blog/${article.slug}`;
    return {
      externalId,
      publishedUrl,
      syncStatus: "published",
    };
  }
}

export class WebhookPublishingAdapter implements PublishingAdapter {
  readonly destination: PublishingDestination = "webhook";

  async publish(article: ArticleToPublish, options?: PublishOptions): Promise<PublishResult> {
    if (!options?.targetUrl) {
      throw new Error("Webhook targetUrl is required for webhook publishing adapter.");
    }

    try {
      const response = await fetch(options.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          articleId: article.id,
          title: article.title,
          slug: article.slug,
          contentHtml: article.contentHtml,
          publishedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          externalId: "",
          publishedUrl: "",
          syncStatus: "failed",
          errorMessage: `Webhook returned status ${response.status}: ${body.slice(0, 200)}`,
        };
      }

      const responseData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const externalId = String(responseData.id ?? `wh-${Date.now()}`);
      const publishedUrl = String(responseData.url ?? `${options.targetUrl}/${article.slug}`);

      return {
        externalId,
        publishedUrl,
        syncStatus: "published",
      };
    } catch (err) {
      return {
        externalId: "",
        publishedUrl: "",
        syncStatus: "failed",
        errorMessage: err instanceof Error ? err.message : "Failed to publish via webhook",
      };
    }
  }
}

export function getPublishingAdapter(destination: PublishingDestination): PublishingAdapter {
  switch (destination) {
    case "webhook":
      return new WebhookPublishingAdapter();
    case "demo":
    default:
      return new DemoPublishingAdapter();
  }
}
