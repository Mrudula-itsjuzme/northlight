import "server-only";
import { z } from "zod";

function getEnv(key: string): string | undefined {
  const val = process.env[key];
  return val === undefined || val === "" ? undefined : val;
}

export const jobsConfigSchema = z.object({
  workerSecret: z.string().default(""),
  maxJobsPerRun: z.number().positive().default(25),
  claimStaleAfterMs: z.number().positive().default(5 * 60 * 1000), // 5 minutes
  retryBackoffMs: z.number().positive().default(30_000), // 30 seconds
  defaultMaxAttempts: z.number().positive().default(3),
});

export type JobsConfig = z.infer<typeof jobsConfigSchema>;

export const jobsConfig = jobsConfigSchema.parse({
  workerSecret: getEnv("JOBS_WORKER_SECRET") ?? "",
  maxJobsPerRun: 25,
  claimStaleAfterMs: 5 * 60 * 1000,
  retryBackoffMs: 30_000,
  defaultMaxAttempts: 3,
});
