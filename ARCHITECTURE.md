# Architecture

Northlight is a **modular monolith**: one Next.js 14 App Router
application, one Postgres database (Supabase), no microservices, no
message broker, no separate backend process. Every domain (keywords,
competitors, content, AI visibility, recommendations, analytics, jobs)
lives in the same codebase and deployment unit, separated by TypeScript
module boundaries rather than network boundaries.

## Why a modular monolith, not microservices

- The whole system fits comfortably in one team's head and one
  deployment. Splitting keyword scoring, content generation, and AI
  visibility into separate services would add network latency, partial-
  failure modes, and deployment coordination cost with no corresponding
  benefit at this scale.
- Every domain already shares the same tenancy model (`brand_id` + RLS)
  and the same Postgres instance — there is no natural data-ownership
  seam that would justify a service boundary.
- Vercel (the deployment target) is built around exactly this shape:
  one Next.js app, serverless functions per route, no always-on process
  required except the database itself.

## Why a `jobs` table instead of Redis/BullMQ

Slow or unreliable work (embedding a brand document, running an 8-stage
content pipeline, checking AI visibility across 6 platforms, generating
competitor gap reports, recomputing recommendations, rescoring keywords)
is modeled as rows in a Postgres `jobs` table
(`status`/`attempts`/`run_at`/`result`/`error`) rather than pushed onto a
Redis-backed queue (BullMQ, Sidekiq-style, etc.):

- **No new infrastructure.** Supabase already provides Postgres. Adding
  Redis means another managed service to provision, secure, and pay for,
  purely to get a queue — Postgres can already do the job with
  `SELECT ... FOR UPDATE SKIP LOCKED`, which is exactly what
  `claimNextJob` (`src/lib/jobs/worker.ts`) uses to let multiple worker
  processes race for jobs safely with zero double-processing.
- **Transactional consistency for free.** A job row can be inserted in
  the SAME transaction as the row it's about (e.g. queue
  `run_content_pipeline` right after creating the `content_pipeline_runs`
  row) — no dual-write problem between "did the DB write commit" and
  "did the queue accept the message" that a separate broker would
  introduce.
- **One source of truth for status.** `jobs.status`/`attempts`/`result`/
  `error` are just columns — queryable with normal SQL from the same
  Analytics/Jobs UI that reads everything else, no separate queue-
  inspection tooling needed.
- **The actual throughput needs are modest.** This app processes
  bursty, per-brand background work (a handful of jobs per brand action),
  not a high-frequency event stream — Postgres-as-queue comfortably
  handles this scale; it would not be the right choice for, say, a
  firehose of millions of events per second.

The tradeoff: no built-in job UI, no automatic rate limiting/backpressure
primitives, and polling (not push) delivery. `runWorkerOnce`
(`src/lib/jobs/worker.ts`) claims and processes jobs in a batch-capped
loop, then exits — see "Worker execution model" below for how this is
actually scheduled.

## Module boundaries

```
src/
  app/                    Next.js App Router — pages, layouts, server actions'
                          UI-facing wrappers. Route groups: (app) = authenticated
                          shell, (auth) = login/signup/reset, onboarding = the
                          setup wizard.
  components/             Shared UI (shadcn/ui-based primitives in ui/, plus
                          layout/auth/brands composition components).
  db/
    schema/*.ts            Drizzle table definitions — the single source of
                          truth for column shapes, grouped by domain file
                          (tenancy, keywords, competitors, content,
                          ai-visibility, growth, billing, jobs, brand-setup).
    migrations/*.sql        Generated SQL (drizzle-kit generate) + hand-written
                          RLS policies (0001_rls_policies.sql).
    index.ts                getDb() — the one place a Drizzle client is
                          constructed, from DATABASE_URL.
  lib/
    <domain>/
      actions.ts            "use server" actions: the ONLY code that calls
                          requireRoleOrThrow and is reachable directly from a
                          Client Component. Thin — parses input, checks the
                          role gate, delegates to...
      <core-logic>.ts       Role-FREE core functions containing the actual
                          business logic (e.g. runPipeline, generateContentBrief,
                          processDocument, persistGapReportsForCompetitor,
                          persistVisibilitySnapshot, computeAndPersistRecommendations,
                          rescoreAllKeywords). These are what BOTH the action
                          (after its role check) and the job worker (which has
                          no request to check a role against) call — a single
                          implementation, two trusted callers.
    brands/                Tenancy: brand CRUD, membership, invites, the
                          requireRole[OrThrow] authorization gate, the
                          "active brand" cookie.
    scoring/                Pure keyword priority formula + clustering — no DB,
                          no side effects, exhaustively unit-testable.
    jobs/                   The worker itself: types.ts (payload schemas per
                          job_type), worker.ts (claim/dispatch/retry),
                          enqueue.ts (validated job insertion).
    usage/                  recordUsageEvent — the one place usage_events rows
                          are written from.
    analytics/              Pure aggregation functions (compute.ts) + the real
                          data-gathering query layer (queries.ts) + the shared
                          live/estimated/demo labeling convention
                          (data-labels.ts).
    validation/             Zod schemas for every typed input boundary (forms,
                          job payloads, CSV rows).
scripts/
  migrate.ts                Applies migrations/*.sql directly to DATABASE_URL.
  seed.ts + seed-data.ts     Seeds the demo brand (see DATABASE.md/README.md).
  worker.ts                  One-shot job-worker entrypoint (see below).
```

### The `actions.ts` / core-logic split, and why it exists

Every `"use server"` action file follows the same two-layer shape:

```ts
// actions.ts — "use server", reachable from Client Components
export async function someAction(brandId: string, ...) {
  await requireRoleOrThrow(brandId, "editor"); // the ONLY auth check
  const result = await someCoreFunction(brandId, ...);  // delegates
  revalidatePath(...);
  return { ok: true, data: result };
}

// core-logic.ts — role-free, no "use server", callable from anywhere server-side
export async function someCoreFunction(brandId: string, ...) {
  // the actual DB reads/writes
}
```

This split exists because the job worker (`src/lib/jobs/worker.ts`) needs
to perform the exact same work a user-triggered action does (run a
pipeline, generate gap reports, compute recommendations, run a
visibility snapshot) but has **no authenticated HTTP request** to check a
role against — it's a background process picking up already-queued work.
Rather than duplicating logic (drift risk) or weakening
`requireRoleOrThrow` to tolerate a "no session" case (a security risk),
the core logic is extracted once and called by both:

- the action, after its role check passes;
- the worker, which is itself the trusted actor (a job row only exists
  because an earlier, already-authorized request created it).

This pattern was established in Phase 4 (`processDocument`), Phase 5
(`rescoreAllKeywords`), and Phase 7 (`runPipeline`, `generateContentBrief`)
before the worker existed, and Phase 12 extended it to the 3 actions that
still had this logic inlined (`persistGapReportsForCompetitor`,
`persistVisibilitySnapshot`, `computeAndPersistRecommendations`).

## Worker execution model

`npm run worker` runs `scripts/worker.ts`, which calls `runWorkerOnce()`
— claim and process jobs in a loop until none are due or a batch cap is
hit, then the process exits. It is NOT a long-lived daemon.

This is intentional: a jobs-table queue doesn't need a persistent
consumer process the way a message-broker queue typically does. Instead,
`npm run worker` is meant to be invoked **on a schedule** by whichever
mechanism the deployment target provides:

- **Vercel Cron** (a `vercel.json` cron entry hitting an API route that
  calls `runWorkerOnce()` server-side) — the recommended approach for a
  Vercel deployment, since Vercel doesn't run arbitrary long-lived
  processes.
- **`pg_cron`** (a Postgres extension available on Supabase) calling out
  to an HTTP endpoint via `pg_net`, if you'd rather keep scheduling
  inside the database.
- **Any external scheduler** (a small VM/container running
  `npm run worker` via cron, GitHub Actions on a schedule, etc.) if
  you're not deploying to Vercel.

See "Deployment" in README.md for the exact steps for the Vercel Cron
approach.

### Non-obvious `server-only` + tsx interaction

Several `lib/**` modules import the `server-only` marker package (a
correct and intentional guard against accidental client-bundle
inclusion). Next.js's webpack build resolves `server-only` to a no-op
under React's `"react-server"` package-export condition; a plain
Node/`tsx`-executed script (like `scripts/worker.ts` or `scripts/seed.ts`)
does not apply that condition by default, so importing those modules
would otherwise throw immediately. Both `npm run worker` and
`npm run db:seed` set `NODE_OPTIONS=--conditions=react-server` to force
Node's own module resolver to pick the same no-op export Next.js would —
see the comment at the top of `scripts/worker.ts` for the full
explanation, and `vitest.config.ts`'s `server-only` alias for how the
test suite handles the same issue differently (a stub module, since
Vitest doesn't go through Node's `--conditions` resolution the same way).

## Request flow (typical: a user triggers an AI-adjacent action)

1. Client Component calls a `"use server"` action (e.g.
   `runVisibilitySnapshot(brandId, promptId)`).
2. The action calls `requireRoleOrThrow(brandId, minimumRole)`, which
   reads the caller's Supabase session (`createClient().auth.getUser()`)
   and their `brand_members.role` row via Drizzle — this is an
   APPLICATION-layer check on top of RLS, not a replacement for it (RLS
   still enforces the brand boundary on every query regardless).
3. The action delegates to the role-free core function
   (`persistVisibilitySnapshot`), which does the real work — in this
   example, calling every configured `VisibilityAdapter` (demo adapters
   for 5 of 6 platforms always; the real OpenAI adapter for ChatGPT only
   if `OPENAI_API_KEY` is configured) and persisting one row per
   platform.
4. `revalidatePath(...)` invalidates the Next.js cache for the affected
   page, and the action returns a discriminated `ActionResult` (`{ ok:
   true, data } | { ok: false, error }`) — every page/component branches
   on `.ok` rather than relying on thrown exceptions crossing the
   server/client boundary.
5. The Server Component re-renders with fresh data on the client's
   `router.refresh()` call.

For work explicitly deferred to the background instead (see
`src/lib/jobs/enqueue.ts`), step 3 becomes "insert a `jobs` row" instead
of doing the work inline, and the SAME core function from step 3 is
later invoked by the worker (see "Worker execution model" above) when it
claims that job.

## Tenancy & authorization (two layers, deliberately)

1. **RLS (Postgres, `src/db/migrations/0001_rls_policies.sql`)**: the
   BRAND BOUNDARY. Every tenant-owned table's policy requires
   `public.is_brand_member(brand_id)` — a user can never see or modify a
   row belonging to a brand they aren't a member of, full stop, enforced
   at the database layer regardless of what application code does or
   forgets to check.
2. **`requireRoleOrThrow` (application layer,
   `src/lib/brands/require-role.ts`)**: FINE-GRAINED ROLE GATES within a
   brand a user IS a member of (e.g. "only owner/admin can invite a new
   member", "only an owner can record a publish-gate override"). RLS
   alone can't express "any member can read, but only an editor can
   write" without per-role policies proliferating; this is handled once,
   in one helper, called explicitly by every action that needs more than
   "any member" access.

See DATABASE.md for the full RLS policy explanation and why both layers
are necessary (an in-request-context check that's easy to get right in
one place, on top of a database-level guarantee that holds even if an
action forgets to call it).

## Never call a real external API without a credential

Every integration point (OpenAI embeddings, OpenAI chat completions,
every AI-visibility-platform's "response") is gated behind a real
credential check (`OPENAI_API_KEY` configured), with a documented,
clearly-labeled deterministic demo adapter as the fallback — never a
silently-faked "success". See AI_SCORING.md for exactly how each demo
adapter works, and the "Demo" badge convention
(`src/lib/analytics/data-labels.ts`) for how this is surfaced in the UI.
