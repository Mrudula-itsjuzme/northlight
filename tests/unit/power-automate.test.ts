import { describe, expect, it, vi } from "vitest";
import { notifyPowerAutomateReview, parsePowerAutomateUrl } from "../../src/lib/integrations/power-automate";

const event = {
  eventId: "event-123",
  eventType: "content.ready_for_review" as const,
  brandId: "brand-123",
  articleId: "article-123",
  title: "A new product guide",
  occurredAt: "2026-11-04T12:00:00.000Z",
};

describe("Power Automate review notification", () => {
  it("disables outbound calls when no endpoint is configured", async () => {
    const fetcher = vi.fn();
    expect(await notifyPowerAutomateReview(event, { endpoint: "", fetcher })).toEqual({ status: "disabled" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS and non-Logic Apps destinations", () => {
    expect(() => parsePowerAutomateUrl("http://example.com/hook")).toThrow();
    expect(() => parsePowerAutomateUrl("https://logic.azure.com.attacker.test/hook")).toThrow();
    expect(() => parsePowerAutomateUrl("https://localhost/hook")).toThrow();
    expect(() => parsePowerAutomateUrl("https://user:pass@west.logic.azure.com/hook")).toThrow();
  });

  it("sends only approved minimal metadata and never follows redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const outcome = await notifyPowerAutomateReview(event, {
      endpoint: "https://west.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=secret",
      fetcher,
    });
    expect(outcome).toEqual({ status: "sent" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url.hostname).toBe("west.logic.azure.com");
    expect(init.redirect).toBe("error");
    const data = JSON.parse(init.body);
    expect(data).toEqual(event);
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("does not treat a provider failure as success", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    expect(await notifyPowerAutomateReview(event, {
      endpoint: "https://west.logic.azure.com/hook", fetcher,
    })).toEqual({ status: "failed", reason: "http_error" });
  });
});
