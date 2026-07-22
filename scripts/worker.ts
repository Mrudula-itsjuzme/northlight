/**
 * One-shot job worker entrypoint: processes every currently-due queued
 * job (up to a batch cap), then exits. Intended to be invoked on a
 * schedule (cron, Vercel Cron hitting a route that calls the same
 * `runWorkerOnce`, a `pg_cron`/external scheduler, etc. — see
 * DEPLOYMENT steps in README.md/ARCHITECTURE.md) rather than run as a
 * long-lived daemon, matching the plan's "no Redis/BullMQ, Postgres
 * table as queue" approach: a short-lived poll-and-exit process is all
 * a jobs-table queue needs, since there's no persistent connection/
 * consumer group to maintain.
 *
 * Requires DATABASE_URL (see src/db/index.ts / .env.example). Does NOT
 * run in this sandbox (no live Postgres connection configured) — the
 * worker's actual dispatch/claim/retry logic is covered by
 * tests/integration/jobs-worker.test.ts against the pglite harness.
 *
 * IMPORTANT: run via `npm run worker`, not `tsx scripts/worker.ts`
 * directly. Several handler modules this script pulls in
 * (src/lib/jobs/worker.ts and its dependencies) import the `server-only`
 * marker package, which unconditionally throws unless resolved under
 * React's `"react-server"` package-export condition — Next.js's webpack
 * build understands that condition automatically, but a plain Node/tsx
 * process does not. `npm run worker` sets
 * `NODE_OPTIONS=--conditions=react-server` so Node's own resolver picks
 * `server-only`'s harmless `empty.js` export instead of the throwing
 * one. `scripts/db:seed` uses the same fix for the same reason.
 */
import "dotenv/config";
import { runWorkerOnce } from "@/lib/jobs/worker";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (or export " +
        "DATABASE_URL directly) with a real Supabase/Postgres connection " +
        "string before running the worker.",
    );
    process.exit(1);
  }

  const processed = await runWorkerOnce();
  console.log(`Worker processed ${processed} job(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Worker run failed:", err);
  process.exit(1);
});
