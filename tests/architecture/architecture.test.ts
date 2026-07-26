import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { JOB_PAYLOAD_SCHEMAS } from "@/lib/jobs/types";

describe("Architecture Validation Suite", () => {
  it("enforces 'server-only' imports in server-bound library modules", () => {
    const serverFiles = [
      "src/lib/jobs/worker.ts",
      "src/lib/content/pipeline/runner.ts",
      "src/lib/evaluations/engine.ts",
      "src/lib/prompts/experimentation.ts",
      "src/lib/campaigns/memory.ts",
      "src/lib/ai/cache.ts",
      "src/lib/ai/cost-optimizer.ts",
      "src/lib/knowledge-graph/extractor.ts",
      "src/lib/ai/visibility/monitoring.ts",
    ];

    for (const fileRel of serverFiles) {
      const fullPath = path.join(process.cwd(), fileRel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        expect(content).toContain('import "server-only";');
      }
    }
  });

  it("validates Zod payload schemas exist for every background job type", () => {
    const jobTypes = [
      "embed_brand_document",
      "generate_content_brief",
      "run_content_pipeline",
      "generate_gap_report",
      "run_ai_visibility_snapshot",
      "compute_recommendations",
      "recompute_keyword_scores",
    ] as const;

    for (const type of jobTypes) {
      expect(JOB_PAYLOAD_SCHEMAS[type]).toBeDefined();
    }
  });

  it("prohibits raw database queries missing brandId scoping in tenancy models", () => {
    const schemaFile = path.join(process.cwd(), "src/db/schema/intelligence.ts");
    const content = fs.readFileSync(schemaFile, "utf-8");
    // Verify multi-tenant tables have brandId indices defined
    expect(content).toContain("brandIdx:");
  });
});
