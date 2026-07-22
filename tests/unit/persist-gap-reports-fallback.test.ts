import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer with a minimal fluent builder that supports exactly the
// chains persist-gap-reports.ts uses: select().from().where().limit() (and
// .orderBy().limit() for the page lookup), and insert().values().
type Row = Record<string, unknown>;

function makeChain(rows: Row[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: Row[]) => void) => resolve(rows),
  };
  return chain;
}

let competitorRows: Row[] = [];
let pageRows: Row[] = [];
const insertedValues: Row[][] = [];

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => {
        // Distinguish "competitors" lookup from "competitorPages" lookup by
        // which mock table object is passed in (see schema mock below).
        if (table === "competitors-table") return makeChain(competitorRows);
        return makeChain(pageRows);
      },
    }),
    insert: () => ({
      values: (values: Row[]) => {
        insertedValues.push(values);
        return Promise.resolve();
      },
    }),
  }),
}));

vi.mock("@/db/schema", () => ({
  competitors: "competitors-table",
  competitorPages: "competitor-pages-table",
  gapReports: "gap-reports-table",
}));

vi.mock("@/lib/competitors/fetch-adapter", async () => {
  const actual = await vi.importActual<typeof import("@/lib/competitors/fetch-adapter")>(
    "@/lib/competitors/fetch-adapter",
  );
  return {
    ...actual,
    fetchCompetitorPage: vi.fn(),
  };
});

import { persistGapReportsForCompetitorWithRealFetch } from "@/lib/competitors/persist-gap-reports";
import { fetchCompetitorPage } from "@/lib/competitors/fetch-adapter";
import { gapReportTypes } from "@/lib/validation/competitors";

describe("persistGapReportsForCompetitorWithRealFetch — fallback wiring", () => {
  beforeEach(() => {
    insertedValues.length = 0;
    competitorRows = [{ id: "competitor-1" }];
    pageRows = [{ url: "https://rival.example/page" }];
    vi.mocked(fetchCompetitorPage).mockReset();
  });

  it("records robots_disallowed as the fallback reason on every supported-type row when robots.txt disallows", async () => {
    vi.mocked(fetchCompetitorPage).mockResolvedValue({
      ok: false,
      reason: "robots_disallowed",
      detail: "disallowed",
    });

    const result = await persistGapReportsForCompetitorWithRealFetch("brand-1", "competitor-1");

    expect(result.realCount).toBe(0);
    expect(result.fallbackCount).toBe(gapReportTypes.length);
    expect(result.fallbackReason).toBe("robots_disallowed");

    const rows = insertedValues[0];
    const contentRow = rows.find((r) => r.type === "content")!;
    expect(contentRow.generatedBy).toBe("demo_adapter_fallback");
    expect(contentRow.isDemo).toBe(true);
    expect((contentRow.findings as { fallbackReason?: string }).fallbackReason).toBe("robots_disallowed");
  });

  it("records timeout as the fallback reason when the fetch times out", async () => {
    vi.mocked(fetchCompetitorPage).mockResolvedValue({
      ok: false,
      reason: "timeout",
      detail: "timed out",
    });

    const result = await persistGapReportsForCompetitorWithRealFetch("brand-1", "competitor-1");
    expect(result.fallbackReason).toBe("timeout");

    const schemaRow = insertedValues[0].find((r) => r.type === "schema")!;
    expect((schemaRow.findings as { fallbackReason?: string }).fallbackReason).toBe("timeout");
  });

  it("records response_too_large as the fallback reason for an oversized response", async () => {
    vi.mocked(fetchCompetitorPage).mockResolvedValue({
      ok: false,
      reason: "response_too_large",
      detail: "too big",
    });

    const result = await persistGapReportsForCompetitorWithRealFetch("brand-1", "competitor-1");
    expect(result.fallbackReason).toBe("response_too_large");
  });

  it("uses the real adapter for content/schema/faq and demo for backlink/ai_citation when the fetch succeeds", async () => {
    vi.mocked(fetchCompetitorPage).mockResolvedValue({
      ok: true,
      signals: {
        url: "https://rival.example/page",
        metaTitle: "Title",
        metaDescription: null,
        headingCounts: { h1: 1, h2: 3, h3: 0 },
        jsonLdTypes: ["Product"],
        hasFaqPattern: false,
        wordCount: 800,
        internalLinkCount: 10,
      },
    });

    const result = await persistGapReportsForCompetitorWithRealFetch("brand-1", "competitor-1");
    expect(result.realCount).toBe(3); // content, schema, faq
    expect(result.fallbackCount).toBe(2); // backlink, ai_citation

    const rows = insertedValues[0];
    expect(rows.find((r) => r.type === "schema")!.generatedBy).toBe("real_fetch");
    expect(rows.find((r) => r.type === "backlink")!.generatedBy).toBe("demo_adapter_fallback");
  });

  it("falls back for every type when the competitor has no page URL on file", async () => {
    pageRows = [];
    const result = await persistGapReportsForCompetitorWithRealFetch("brand-1", "competitor-1");
    expect(result.realCount).toBe(0);
    expect(result.fallbackCount).toBe(gapReportTypes.length);
    expect(fetchCompetitorPage).not.toHaveBeenCalled();
  });
});
