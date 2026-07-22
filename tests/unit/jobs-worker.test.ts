import { describe, it, expect } from "vitest";
import { decideFailureOutcome } from "@/lib/jobs/worker";
import { JOB_PAYLOAD_SCHEMAS } from "@/lib/jobs/types";

describe("decideFailureOutcome", () => {
  it("retries with a 30s*attempts backoff when attempts have not reached maxAttempts", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const outcome = decideFailureOutcome({ attempts: 1, maxAttempts: 3 }, now);
    expect(outcome.status).toBe("queued");
    if (outcome.status === "queued") {
      expect(outcome.runAt.getTime() - now.getTime()).toBe(30_000 * 1);
    }
  });

  it("scales backoff linearly with the attempts count", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const outcome = decideFailureOutcome({ attempts: 2, maxAttempts: 3 }, now);
    expect(outcome.status).toBe("queued");
    if (outcome.status === "queued") {
      expect(outcome.runAt.getTime() - now.getTime()).toBe(30_000 * 2);
    }
  });

  it("marks the job permanently failed once attempts reaches maxAttempts", () => {
    const outcome = decideFailureOutcome({ attempts: 3, maxAttempts: 3 });
    expect(outcome).toEqual({ status: "failed" });
  });

  it("marks permanently failed if attempts somehow exceeds maxAttempts", () => {
    const outcome = decideFailureOutcome({ attempts: 5, maxAttempts: 3 });
    expect(outcome).toEqual({ status: "failed" });
  });
});

describe("JOB_PAYLOAD_SCHEMAS", () => {
  const validUuid = "10101010-1111-4111-8111-111111111111";

  it("has exactly one schema per job_type enum value", () => {
    // Mirrors src/db/schema/enums.ts jobTypeEnum exactly — if a job type
    // is added to the DB enum without a matching schema here, the
    // worker would silently have no validator/handler for it.
    expect(Object.keys(JOB_PAYLOAD_SCHEMAS).sort()).toEqual(
      [
        "embed_brand_document",
        "generate_content_brief",
        "run_content_pipeline",
        "generate_gap_report",
        "run_ai_visibility_snapshot",
        "compute_recommendations",
        "recompute_keyword_scores",
      ].sort(),
    );
  });

  it("validates a correct embed_brand_document payload", () => {
    expect(
      JOB_PAYLOAD_SCHEMAS.embed_brand_document.parse({ brandDocumentId: validUuid }),
    ).toEqual({ brandDocumentId: validUuid });
  });

  it("rejects a malformed payload (missing required field)", () => {
    expect(() => JOB_PAYLOAD_SCHEMAS.generate_content_brief.parse({ brandId: validUuid })).toThrow();
  });

  it("rejects a payload with a non-uuid id field", () => {
    expect(() =>
      JOB_PAYLOAD_SCHEMAS.run_content_pipeline.parse({ runId: "not-a-uuid" }),
    ).toThrow();
  });

  it("validates a correct compute_recommendations payload", () => {
    expect(JOB_PAYLOAD_SCHEMAS.compute_recommendations.parse({ brandId: validUuid })).toEqual({
      brandId: validUuid,
    });
  });
});
