import { describe, it, expect } from "vitest";
import { getPublishingAdapter } from "@/lib/publishing/adapters";

describe("Publishing Adapters", () => {
  it("DemoPublishingAdapter produces valid published URL and externalId", async () => {
    const adapter = getPublishingAdapter("demo");
    const result = await adapter.publish({
      id: "10101010-1111-4111-8111-111111111111",
      title: "Test Article",
      slug: "test-article",
      contentHtml: "<p>Hello</p>",
    });

    expect(result.syncStatus).toBe("published");
    expect(result.publishedUrl).toContain("test-article");
    expect(result.externalId).toBeTruthy();
  });

  it("WebhookPublishingAdapter fails gracefully if targetUrl is missing", async () => {
    const adapter = getPublishingAdapter("webhook");
    await expect(
      adapter.publish({
        id: "10101010-1111-4111-8111-111111111111",
        title: "Test Article",
        slug: "test-article",
        contentHtml: "<p>Hello</p>",
      }),
    ).rejects.toThrow(/targetUrl is required/);
  });
});
