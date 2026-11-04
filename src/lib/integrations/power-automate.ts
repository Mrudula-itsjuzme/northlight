/**
 * Optional outbound notification to a Power Automate HTTP-triggered cloud flow.
 * Never authorize a publication based on an HTTP response: Northlight's own
 * authenticated review/publish gate remains authoritative.
 *
 * The signed flow URL is a credential. Keep it server-side and do not log it.
 */
import "server-only";

export type ContentReviewNotification = {
  eventId: string;
  eventType: "content.ready_for_review";
  brandId: string;
  articleId: string;
  title: string;
  occurredAt: string;
};

/** Reject arbitrary destinations to reduce SSRF and accidental exfiltration. */
export function parsePowerAutomateUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Invalid Power Automate endpoint");
  }
  // Standard Azure Logic Apps HTTP-trigger URLs used by Power Automate.
  // Other environments need an explicitly reviewed allowlist change.
  if (!url.hostname.toLowerCase().endsWith(".logic.azure.com")) {
    throw new Error("Unsupported Power Automate endpoint host");
  }
  return url;
}

export type NotifyResult =
  | { status: "disabled" }
  | { status: "sent" }
  | { status: "failed"; reason: "timeout" | "http_error" | "network_error" | "invalid_configuration" };

export async function notifyPowerAutomateReview(
  event: ContentReviewNotification,
  options: {
    endpoint?: string;
    fetcher?: typeof fetch;
  } = {},
): Promise<NotifyResult> {
  const raw = options.endpoint ?? process.env.POWER_AUTOMATE_REVIEW_WEBHOOK_URL;
  if (!raw) return { status: "disabled" };
  let endpoint: URL;
  try {
    endpoint = parsePowerAutomateUrl(raw);
  } catch {
    return { status: "failed", reason: "invalid_configuration" };
  }

  // No article body, customer documents, emails or privileged tokens leave Northlight.
  const payload = {
    eventId: event.eventId,
    eventType: event.eventType,
    brandId: event.brandId,
    articleId: event.articleId,
    title: event.title.slice(0, 200),
    occurredAt: event.occurredAt,
  };

  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return { status: "failed", reason: "http_error" };
    return { status: "sent" };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { status: "failed", reason: "timeout" };
    }
    return { status: "failed", reason: "network_error" };
  }
}
