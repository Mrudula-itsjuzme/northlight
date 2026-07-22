import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCompetitorPage, isPathAllowedByRobotsTxt } from "@/lib/competitors/fetch-adapter";

const HTML_FIXTURE_RICH = `
<!doctype html>
<html>
<head>
  <title>Best Detangling Brushes for Curly Hair | RivalCo</title>
  <meta name="description" content="A buying guide for detangling brushes." />
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}
  </script>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Detangler Pro"}
  </script>
</head>
<body>
  <h1>Best Detangling Brushes for Curly Hair</h1>
  <h2>What makes a good detangling brush?</h2>
  <p>${"word ".repeat(900)}</p>
  <h2>How do I clean my brush?</h2>
  <p>${"word ".repeat(400)}</p>
  <a href="/products/brush-1">Brush 1</a>
  <a href="/products/brush-2">Brush 2</a>
  <a href="https://external-site.example/other">External</a>
</body>
</html>
`;

const HTML_FIXTURE_MINIMAL = `
<!doctype html>
<html>
<head><title>Home</title></head>
<body><h1>Welcome</h1><p>Hello world.</p></body>
</html>
`;

function htmlResponse(html: string, opts: { status?: number; contentType?: string; contentLength?: string } = {}) {
  const headers = new Map<string, string>();
  headers.set("content-type", opts.contentType ?? "text/html; charset=utf-8");
  if (opts.contentLength) headers.set("content-length", opts.contentLength);

  return {
    ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
    status: opts.status ?? 200,
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
    text: async () => html,
    body: {
      getReader() {
        let done = false;
        return {
          async read() {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: new TextEncoder().encode(html) };
          },
          async cancel() {},
        };
      },
    },
  } as unknown as Response;
}

function robotsAllowAllResponse() {
  return htmlResponse("User-agent: *\nDisallow:\n", { contentType: "text/plain" });
}

describe("isPathAllowedByRobotsTxt", () => {
  it("allows everything when there is no matching Disallow rule", () => {
    const robots = "User-agent: *\nDisallow: /admin\n";
    expect(isPathAllowedByRobotsTxt(robots, "NorthlightBot/1.0", "/blog/post")).toBe(true);
  });

  it("disallows a path matching a Disallow rule", () => {
    const robots = "User-agent: *\nDisallow: /private\n";
    expect(isPathAllowedByRobotsTxt(robots, "NorthlightBot/1.0", "/private/page")).toBe(false);
  });

  it("prefers a more specific Allow over a broader Disallow", () => {
    const robots = "User-agent: *\nDisallow: /blog\nAllow: /blog/allowed\n";
    expect(isPathAllowedByRobotsTxt(robots, "NorthlightBot/1.0", "/blog/allowed/page")).toBe(true);
    expect(isPathAllowedByRobotsTxt(robots, "NorthlightBot/1.0", "/blog/other")).toBe(false);
  });

  it("treats an empty Disallow value as allow-all", () => {
    const robots = "User-agent: *\nDisallow:\n";
    expect(isPathAllowedByRobotsTxt(robots, "NorthlightBot/1.0", "/anything")).toBe(true);
  });
});

describe("fetchCompetitorPage — HTML parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts heading structure, JSON-LD types, FAQ pattern, meta, word count, and internal links from a rich fixture", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/robots.txt")) return robotsAllowAllResponse();
        return htmlResponse(HTML_FIXTURE_RICH);
      }),
    );

    const result = await fetchCompetitorPage("https://rivalco.example/guides/brushes");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.signals.headingCounts).toEqual({ h1: 1, h2: 2, h3: 0 });
    expect(result.signals.jsonLdTypes.sort()).toEqual(["FAQPage", "Product"].sort());
    expect(result.signals.hasFaqPattern).toBe(true);
    expect(result.signals.metaTitle).toContain("Detangling Brushes");
    expect(result.signals.metaDescription).toContain("buying guide");
    expect(result.signals.wordCount).toBeGreaterThan(1000);
    expect(result.signals.internalLinkCount).toBe(2);
  });

  it("reports no FAQ pattern and low word count for a minimal fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) return robotsAllowAllResponse();
        return htmlResponse(HTML_FIXTURE_MINIMAL);
      }),
    );

    const result = await fetchCompetitorPage("https://minimal.example/page");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.signals.jsonLdTypes).toEqual([]);
    expect(result.signals.hasFaqPattern).toBe(false);
    expect(result.signals.wordCount).toBeLessThan(20);
  });
});

describe("fetchCompetitorPage — fallback-triggering failures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns robots_disallowed when robots.txt disallows the path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) {
          return htmlResponse("User-agent: *\nDisallow: /\n", { contentType: "text/plain" });
        }
        return htmlResponse(HTML_FIXTURE_MINIMAL);
      }),
    );

    const result = await fetchCompetitorPage("https://blocked.example/anything");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("robots_disallowed");
  });

  it("returns timeout when the fetch is aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { signal?: AbortSignal }) => {
        if (url.endsWith("/robots.txt")) return robotsAllowAllResponse();
        // Simulate a hang that only resolves via abort.
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }),
    );

    const result = await fetchCompetitorPage("https://slow.example/page");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  }, 15000);

  it("returns non_2xx for a non-success HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) return robotsAllowAllResponse();
        return htmlResponse("Not Found", { status: 404 });
      }),
    );

    const result = await fetchCompetitorPage("https://missing.example/page");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("non_2xx");
  });

  it("returns non_html_content_type for a non-HTML response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) return robotsAllowAllResponse();
        return htmlResponse(JSON.stringify({ ok: true }), { contentType: "application/json" });
      }),
    );

    const result = await fetchCompetitorPage("https://api.example/data.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("non_html_content_type");
  });

  it("returns response_too_large when Content-Length exceeds the cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) return robotsAllowAllResponse();
        return htmlResponse(HTML_FIXTURE_MINIMAL, { contentLength: String(3 * 1024 * 1024) });
      }),
    );

    const result = await fetchCompetitorPage("https://huge.example/page");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("response_too_large");
  });

  it("returns response_too_large when the streamed body exceeds the cap even without a Content-Length header", async () => {
    const hugeHtml = `<html><body>${"x".repeat(3 * 1024 * 1024)}</body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) return robotsAllowAllResponse();
        return htmlResponse(hugeHtml);
      }),
    );

    const result = await fetchCompetitorPage("https://huge-stream.example/page");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("response_too_large");
  });

  it("returns invalid_url for a malformed URL", async () => {
    const result = await fetchCompetitorPage("not-a-url");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_url");
  });
});
