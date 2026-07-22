import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  consume,
  perWindow,
  rateLimitKey,
  checkRateLimit,
  RATE_LIMITS,
  __resetRateLimitsForTests,
} from "@/lib/rate-limit";

describe("rate-limit token bucket", () => {
  beforeEach(() => {
    __resetRateLimitsForTests();
    vi.useRealTimers();
  });

  it("allows requests up to capacity, then denies", () => {
    const config = perWindow(3, 60_000);
    const key = "test:bucket-a";

    expect(consume(key, config).allowed).toBe(true);
    expect(consume(key, config).allowed).toBe(true);
    expect(consume(key, config).allowed).toBe(true);
    const fourth = consume(key, config);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAtMs).toBeGreaterThan(Date.now());
  });

  it("refills tokens over time", () => {
    vi.useFakeTimers();
    const start = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(start);

    const config = perWindow(2, 1000); // 2 tokens per second
    const key = "test:bucket-b";

    expect(consume(key, config).allowed).toBe(true);
    expect(consume(key, config).allowed).toBe(true);
    expect(consume(key, config).allowed).toBe(false);

    // Advance 500ms -> should refill ~1 token (2 tokens/sec * 0.5s = 1)
    vi.setSystemTime(new Date(start.getTime() + 500));
    const afterRefill = consume(key, config);
    expect(afterRefill.allowed).toBe(true);

    vi.useRealTimers();
  });

  it("never exceeds capacity even after a long idle period", () => {
    vi.useFakeTimers();
    const start = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(start);

    const config = perWindow(5, 1000);
    const key = "test:bucket-c";
    consume(key, config); // 4 left

    // Advance a huge amount of time - bucket should cap at capacity, not overflow.
    vi.setSystemTime(new Date(start.getTime() + 1_000_000));
    const result = consume(key, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(config.capacity - 1);

    vi.useRealTimers();
  });

  it("tracks separate buckets independently per key", () => {
    const config = perWindow(1, 60_000);
    expect(consume("test:key-1", config).allowed).toBe(true);
    expect(consume("test:key-1", config).allowed).toBe(false);
    // A different key has its own independent bucket.
    expect(consume("test:key-2", config).allowed).toBe(true);
  });

  it("rateLimitKey combines action and actor deterministically", () => {
    expect(rateLimitKey("documentUpload", "brand-123")).toBe("documentUpload:brand-123");
    expect(rateLimitKey("documentUpload", "brand-123")).toBe(
      rateLimitKey("documentUpload", "brand-123"),
    );
  });

  it("checkRateLimit returns ok for the first calls within a preset's capacity", () => {
    const brandId = "brand-xyz";
    for (let i = 0; i < RATE_LIMITS.documentUpload.capacity; i++) {
      const result = checkRateLimit("documentUpload", brandId);
      expect(result.ok).toBe(true);
    }
  });

  it("checkRateLimit returns a typed error with a retry hint once exhausted", () => {
    const brandId = "brand-exhaust";
    for (let i = 0; i < RATE_LIMITS.inviteSend.capacity; i++) {
      checkRateLimit("inviteSend", brandId);
    }
    const result = checkRateLimit("inviteSend", brandId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/too many requests/i);
    }
  });

  it("different actors under the same action do not share a bucket", () => {
    for (let i = 0; i < RATE_LIMITS.contentBrief.capacity; i++) {
      expect(checkRateLimit("contentBrief", "brand-A").ok).toBe(true);
    }
    expect(checkRateLimit("contentBrief", "brand-A").ok).toBe(false);
    // A different brand is unaffected.
    expect(checkRateLimit("contentBrief", "brand-B").ok).toBe(true);
  });
});
