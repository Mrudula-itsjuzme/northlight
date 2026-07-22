import "server-only";
import * as cheerio from "cheerio";

/**
 * Real (scoped) competitor page fetch + parse adapter.
 *
 * Given a competitor page URL, this: (1) checks the page's `robots.txt`
 * allows crawling that path before fetching anything else, (2) fetches the
 * page itself with a timeout and a response-size cap, (3) parses the HTML
 * with `cheerio` (no headless browser — this only needs the served HTML,
 * not client-side-rendered content, which is an intentional scope
 * boundary, not an oversight) into a small set of structural signals gap
 * analysis can reason about.
 *
 * This is deliberately NOT used for the seeded demo brand — see
 * `generateGapReportsForCompetitor` in `actions.ts`, which only calls this
 * adapter for non-demo brands, and `scripts/seed.ts`, which calls
 * `persistGapReportsForCompetitor` (the deterministic-only core) directly
 * and never imports this module at all.
 */

export type FetchAdapterFailureReason =
  | "robots_disallowed"
  | "timeout"
  | "non_2xx"
  | "non_html_content_type"
  | "response_too_large"
  | "invalid_url"
  | "network_error";

export type PageSignals = {
  url: string;
  metaTitle: string | null;
  metaDescription: string | null;
  headingCounts: { h1: number; h2: number; h3: number };
  jsonLdTypes: string[];
  hasFaqPattern: boolean;
  wordCount: number;
  internalLinkCount: number;
};

export type FetchAdapterResult =
  | { ok: true; signals: PageSignals }
  | { ok: false; reason: FetchAdapterFailureReason; detail: string };

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB
const USER_AGENT = "NorthlightBot/1.0 (+https://northlight.app/bot)";

/** Fetches a URL with a hard timeout, aborting the request if it's exceeded. */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads a Response body up to `maxBytes`, aborting (throwing) if the stream
 * exceeds the cap rather than buffering an unbounded response into memory.
 */
async function readBodyWithCap(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    // Environments without a streamable body (unlikely for fetch, but
    // defensive): fall back to text() and enforce the cap after the fact.
    const text = await response.text();
    if (Buffer.byteLength(text, "utf-8") > maxBytes) {
      throw new Error("response_too_large");
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const decoder = new TextDecoder("utf-8");
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("response_too_large");
      }
      chunks.push(value);
    }
  }

  for (const chunk of chunks) {
    result += decoder.decode(chunk, { stream: true });
  }
  result += decoder.decode();
  return result;
}

/**
 * Minimal robots.txt parser: checks whether `path` is allowed for our user
 * agent (falling back to `*`) under the standard Disallow/Allow directive
 * rules (longest-match-wins, case-sensitive path prefix matching). Missing
 * or unfetchable robots.txt is treated as "allow everything" per the
 * de facto standard (no robots.txt means no restrictions declared).
 */
export function isPathAllowedByRobotsTxt(
  robotsTxt: string,
  userAgent: string,
  path: string,
): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());

  type Group = { agents: string[]; rules: Array<{ type: "allow" | "disallow"; path: string }> };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    if (!line) continue;
    const match = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!match) continue;
    const directive = match[1].toLowerCase();
    const value = match[2].trim();

    if (directive === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [value.toLowerCase()], rules: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (directive === "allow" && current) {
      current.rules.push({ type: "allow", path: value });
    } else if (directive === "disallow" && current) {
      current.rules.push({ type: "disallow", path: value });
    }
  }

  const uaLower = userAgent.toLowerCase();
  const applicableGroups = groups.filter(
    (g) => g.agents.includes(uaLower) || g.agents.includes("*"),
  );
  // Prefer a group that specifically names our UA over the wildcard group.
  const specific = applicableGroups.filter((g) => g.agents.includes(uaLower) && !g.agents.includes("*"));
  const effectiveGroups = specific.length > 0 ? specific : applicableGroups;

  let bestMatch: { type: "allow" | "disallow"; length: number } | null = null;
  for (const group of effectiveGroups) {
    for (const rule of group.rules) {
      if (rule.path === "") {
        // An empty Disallow means "allow everything"; empty Allow is a no-op.
        if (rule.type === "disallow") continue;
      }
      if (path.startsWith(rule.path) && rule.path.length > (bestMatch?.length ?? -1)) {
        bestMatch = { type: rule.type, length: rule.path.length };
      }
    }
  }

  if (!bestMatch) return true;
  return bestMatch.type === "allow";
}

async function checkRobotsTxt(targetUrl: URL): Promise<{ allowed: boolean }> {
  const robotsUrl = `${targetUrl.origin}/robots.txt`;
  try {
    const res = await fetchWithTimeout(robotsUrl, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      // No robots.txt (404) or it errored — de facto standard: allow.
      return { allowed: true };
    }
    const text = await readBodyWithCap(res, MAX_RESPONSE_BYTES);
    const allowed = isPathAllowedByRobotsTxt(text, USER_AGENT, targetUrl.pathname || "/");
    return { allowed };
  } catch {
    // robots.txt itself timed out/network-failed — fail open (allow),
    // consistent with "missing robots.txt = allow" above. The page fetch
    // itself still has its own timeout/size/status checks.
    return { allowed: true };
  }
}

function extractSignals(html: string, url: string): PageSignals {
  const $ = cheerio.load(html);

  const headingCounts = {
    h1: $("h1").length,
    h2: $("h2").length,
    h3: $("h3").length,
  };

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const type = item?.["@type"];
        if (typeof type === "string") jsonLdTypes.push(type);
        else if (Array.isArray(type)) jsonLdTypes.push(...type.filter((t) => typeof t === "string"));
      }
    } catch {
      // Malformed JSON-LD on the target page — skip it, don't fail the whole parse.
    }
  });

  const hasFaqSchema = jsonLdTypes.some((t) => t.toLowerCase() === "faqpage");
  // FAQ-pattern heuristic beyond schema: repeated heading text ending in "?"
  // is a strong signal of a Q&A-shaped section even without FAQPage markup.
  const questionHeadings = $("h2, h3")
    .toArray()
    .filter((el) => $(el).text().trim().endsWith("?")).length;
  const hasFaqPattern = hasFaqSchema || questionHeadings >= 2;

  const metaTitle = $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").filter(Boolean).length : 0;

  let internalLinkCount = 0;
  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  })();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("/") || (origin && href.startsWith(origin))) {
      internalLinkCount++;
    }
  });

  return {
    url,
    metaTitle,
    metaDescription,
    headingCounts,
    jsonLdTypes: Array.from(new Set(jsonLdTypes)),
    hasFaqPattern,
    wordCount,
    internalLinkCount,
  };
}

/**
 * Fetches and parses a single competitor page. Returns a typed failure
 * reason on any problem (invalid URL, robots.txt disallow, timeout,
 * non-2xx, non-HTML content type, oversized response, network error) so
 * the caller can fall back to the deterministic demo adapter and record
 * *why* it fell back.
 */
export async function fetchCompetitorPage(url: string): Promise<FetchAdapterResult> {
  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return { ok: false, reason: "invalid_url", detail: `Unsupported protocol: ${targetUrl.protocol}` };
    }
  } catch {
    return { ok: false, reason: "invalid_url", detail: `Could not parse URL: ${url}` };
  }

  const robots = await checkRobotsTxt(targetUrl);
  if (!robots.allowed) {
    return {
      ok: false,
      reason: "robots_disallowed",
      detail: `robots.txt disallows crawling ${targetUrl.pathname} for ${USER_AGENT}`,
    };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(targetUrl.toString(), FETCH_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout", detail: `Fetch exceeded ${FETCH_TIMEOUT_MS}ms timeout` };
    }
    return { ok: false, reason: "network_error", detail: err instanceof Error ? err.message : "fetch failed" };
  }

  if (!response.ok) {
    return { ok: false, reason: "non_2xx", detail: `HTTP ${response.status}` };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return { ok: false, reason: "non_html_content_type", detail: `Content-Type: ${contentType || "(missing)"}` };
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_RESPONSE_BYTES) {
    return { ok: false, reason: "response_too_large", detail: `Content-Length: ${contentLengthHeader}` };
  }

  let html: string;
  try {
    html = await readBodyWithCap(response, MAX_RESPONSE_BYTES);
  } catch (err) {
    if (err instanceof Error && err.message === "response_too_large") {
      return { ok: false, reason: "response_too_large", detail: `Exceeded ${MAX_RESPONSE_BYTES} byte cap` };
    }
    return { ok: false, reason: "network_error", detail: err instanceof Error ? err.message : "body read failed" };
  }

  try {
    const signals = extractSignals(html, targetUrl.toString());
    return { ok: true, signals };
  } catch (err) {
    return { ok: false, reason: "network_error", detail: err instanceof Error ? err.message : "parse failed" };
  }
}
