import { describe, it, expect } from "vitest";
import { clusterKeywords } from "@/lib/scoring/cluster";

describe("clusterKeywords", () => {
  it("groups keywords that share significant tokens into one cluster", () => {
    const keywords = [
      { id: "1", term: "detangling brush for kids" },
      { id: "2", term: "best detangling brush for curly hair" },
      { id: "3", term: "sulfate free shampoo" },
    ];

    const clusters = clusterKeywords(keywords);
    const clusterFor1 = clusters.find((c) => c.keywordIds.includes("1"));
    const clusterFor2 = clusters.find((c) => c.keywordIds.includes("2"));
    const clusterFor3 = clusters.find((c) => c.keywordIds.includes("3"));

    expect(clusterFor1).toBe(clusterFor2);
    expect(clusterFor3).not.toBe(clusterFor1);
  });

  it("is deterministic for the same input", () => {
    const keywords = [
      { id: "1", term: "tween haircare routine" },
      { id: "2", term: "haircare routine for tweens" },
      { id: "3", term: "competitor pricing analysis" },
    ];

    const first = clusterKeywords(keywords);
    const second = clusterKeywords(keywords);
    expect(first).toEqual(second);
  });

  it("returns an empty array for no keywords", () => {
    expect(clusterKeywords([])).toEqual([]);
  });

  it("puts a single keyword with no overlap into its own cluster", () => {
    const keywords = [{ id: "1", term: "unique unrelated phrase" }];
    const clusters = clusterKeywords(keywords);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].keywordIds).toEqual(["1"]);
  });

  it("names a cluster after its longest member term", () => {
    const keywords = [
      { id: "1", term: "detangling brush" },
      { id: "2", term: "detangling brush for curly hair kids" },
    ];
    const clusters = clusterKeywords(keywords);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].name).toBe("detangling brush for curly hair kids");
  });

  it("does not cluster keywords with no significant token overlap", () => {
    const keywords = [
      { id: "1", term: "detangling brush" },
      { id: "2", term: "quarterly earnings report" },
    ];
    const clusters = clusterKeywords(keywords);
    expect(clusters).toHaveLength(2);
  });

  it("ignores stopwords when computing overlap", () => {
    const keywords = [
      { id: "1", term: "the best shampoo for you" },
      { id: "2", term: "shampoo for your hair" },
    ];
    const clusters = clusterKeywords(keywords);
    // Both share "shampoo" as their only significant token, so they
    // should cluster together despite differing stopwords.
    expect(clusters).toHaveLength(1);
  });
});
