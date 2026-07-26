export type PublishingDestination =
  | "webhook"
  | "devto"
  | "ghost"
  | "custom_cms"
  | "demo";

export type PublishOptions = {
  destination?: PublishingDestination;
  targetUrl?: string;
  apiKey?: string;
  idempotencyKey?: string;
};

export type PublishResult = {
  externalId: string;
  publishedUrl: string;
  syncStatus: "published" | "failed";
  errorMessage?: string;
};

export type ArticleToPublish = {
  id: string;
  title: string;
  slug: string;
  contentHtml: string;
};

export interface PublishingAdapter {
  readonly destination: PublishingDestination;
  publish(article: ArticleToPublish, options?: PublishOptions): Promise<PublishResult>;
}
