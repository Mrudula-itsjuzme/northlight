import "server-only";

/**
 * Minimal in-process token-bucket rate limiter.
 *
 * Scope: this guards expensive/abusable server actions (AI generation
 * triggers, AI visibility checks, document uploads, invite sending) against
 * accidental or malicious hammering from a single tenant. It is
 * intentionally NOT a distributed rate limiter — state lives in a plain
 * in-memory Map, so it only limits requests hitting the *same server
 * process*. On Vercel (or any multi-instance/serverless deployment), each
 * lambda/edge instance gets its own bucket, so the effective limit is
 * "N requests per instance" rather than a true global limit.
 *
 * For a real multi-instance production deployment, back this with a shared
 * store instead (e.g. Upstash Redis' `@upstash/ratelimit`, or Postgres). The
 * public interface below (`consume`) is deliberately storage-agnostic so
 * swapping the in-memory Map for a Redis-backed implementation later is a
 * localized change — callers never need to change.
 */

export type RateLimitResult = {
  /** Whether this call is allowed to proceed. */
  allowed: boolean;
  /** Tokens remaining in the bucket after this call. */
  remaining: number;
  /** Unix ms timestamp when the bucket will next have a token available. */
  retryAtMs: number;
};

type Bucket = {
  tokens: number;
  lastRefillMs: number;
};

const buckets = new Map<string, Bucket>();

/** Periodically drop buckets that have been full and idle, so the Map does not grow forever. */
const MAX_BUCKETS = 50_000;

export type RateLimitConfig = {
  /** Maximum tokens the bucket can hold (burst capacity). */
  capacity: number;
  /** Tokens refilled per millisecond (capacity / windowMs is the usual way to derive this). */
  refillPerMs: number;
};

/** Convenience constructor: "N requests per windowMs, refilled continuously". */
export function perWindow(capacity: number, windowMs: number): RateLimitConfig {
  return { capacity, refillPerMs: capacity / windowMs };
}

/** Named presets for the action types this app currently rate-limits. Tune here in one place. */
export const RATE_LIMITS = {
  // AI generation triggers: brief creation + pipeline runs are the most
  // expensive operations in the app (LLM calls when configured).
  contentBrief: perWindow(10, 60_000), // 10 briefs / minute / brand
  pipelineRun: perWindow(5, 60_000), // 5 pipeline runs / minute / brand
  // AI visibility checks fan out to up to 6 platform adapters per call.
  visibilitySnapshot: perWindow(10, 60_000), // 10 snapshots / minute / brand
  // Document upload: parsing PDFs/DOCX is CPU-bound; also a vector for
  // resource-exhaustion abuse if unbounded.
  documentUpload: perWindow(10, 60_000), // 10 uploads / minute / brand
  // Invite sending: prevent spamming invite emails / token generation.
  inviteSend: perWindow(20, 3_600_000), // 20 invites / hour / brand
} as const satisfies Record<string, RateLimitConfig>;

function getBucket(key: string, capacity: number): Bucket {
  const existing = buckets.get(key);
  if (existing) return existing;

  if (buckets.size >= MAX_BUCKETS) {
    // Defensive cap so a very long-running process (or an attacker cycling
    // keys) can't grow this Map unboundedly. Evicts the oldest-inserted
    // entry (Map preserves insertion order); this is a rare path in normal
    // operation given realistic tenant counts.
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  }

  const fresh: Bucket = { tokens: capacity, lastRefillMs: Date.now() };
  buckets.set(key, fresh);
  return fresh;
}

/**
 * Attempts to consume one token from the bucket identified by `key` under
 * `config`. Refills the bucket based on elapsed time since last refill
 * (continuous token-bucket, not fixed-window), then either takes a token
 * (allowed) or reports how long until one is available (denied).
 *
 * `key` should uniquely identify (actor, action) — see `rateLimitKey` below
 * for the standard way to build it from (userId or brandId) + action name.
 */
export function consume(key: string, config: RateLimitConfig): RateLimitResult {
  const bucket = getBucket(key, config.capacity);
  const now = Date.now();

  const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
  bucket.tokens = Math.min(config.capacity, bucket.tokens + elapsedMs * config.refillPerMs);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAtMs: now };
  }

  const tokensNeeded = 1 - bucket.tokens;
  const msUntilToken = tokensNeeded / config.refillPerMs;
  return {
    allowed: false,
    remaining: 0,
    retryAtMs: now + Math.ceil(msUntilToken),
  };
}

/** Builds the standard rate-limit bucket key: `${action}:${actorId}`. */
export function rateLimitKey(action: string, actorId: string): string {
  return `${action}:${actorId}`;
}

/**
 * Convenience wrapper: consumes a token for (action, actorId) using a named
 * preset from `RATE_LIMITS`, returning a plain ok/error result shaped like
 * this codebase's `ActionResult` so callers can return it directly.
 */
export function checkRateLimit(
  action: keyof typeof RATE_LIMITS,
  actorId: string,
): { ok: true } | { ok: false; error: string } {
  const config = RATE_LIMITS[action];
  const result = consume(rateLimitKey(action, actorId), config);
  if (result.allowed) return { ok: true };

  const retryInSeconds = Math.max(1, Math.ceil((result.retryAtMs - Date.now()) / 1000));
  return {
    ok: false,
    error: `Too many requests. Please try again in ${retryInSeconds}s.`,
  };
}

/** Test-only: clears all bucket state between test cases. */
export function __resetRateLimitsForTests(): void {
  buckets.clear();
}
