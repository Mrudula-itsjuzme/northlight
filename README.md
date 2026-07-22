# Northlight

Northlight is an **AI Growth OS for D2C brands** — a single Next.js app
that helps a brand find high-priority keywords, spot competitor content
gaps, run keyword briefs through a content pipeline, track how visible
the brand is in AI assistant answers (ChatGPT, Claude, Gemini,
Perplexity, Copilot, AI Overviews), and get a ranked list of what to do
next — all backed by one Supabase Postgres database with tenant
isolation via Row Level Security.

See `ARCHITECTURE.md` for the system design, `DATABASE.md` for the
schema/RLS model, `AI_SCORING.md` for every scoring/parsing formula
with worked numeric examples, and `SECURITY.md` for what's covered by
this app's security hardening pass (RLS, rate limiting, upload
validation, security headers) and what's explicitly out of scope for
the MVP.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the full test
suite, and a production build on every push and pull request.

## Stack

- Next.js 14 (App Router), TypeScript (strict)
- Tailwind CSS + shadcn/ui, Recharts for charts
- Supabase (Postgres, Auth, Storage, RLS, pgvector)
- Drizzle ORM (typed schema + SQL migrations)
- Zod for every typed input boundary
- Vitest (unit + integration, via an embedded pglite Postgres for
  behavioral/RLS tests — no Docker or local Postgres server required)
- One real LLM provider adapter (OpenAI), with deterministic demo
  adapters as the fallback everywhere a credential isn't configured —
  see "Running without any real credentials" below.

## Quickstart (local development)

```bash
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
# SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL from a Supabase project
# (see "Deployment" below for how to create one). OPENAI_API_KEY is
# optional — see the next section if you don't have one yet.

npm run db:migrate   # applies src/db/migrations/*.sql to DATABASE_URL
npm run db:seed      # seeds one complete demo brand ("Curl Co") — see below
npm run dev          # http://localhost:3000
```

## Running without any real credentials

Northlight is designed to run fully on deterministic demo adapters when
no `OPENAI_API_KEY` is configured:

- **Embeddings**: a deterministic hash-based embedding
  (`src/lib/ai/embeddings.ts`) instead of a real OpenAI embeddings call.
- **Content generation**: the 8-stage content pipeline
  (`src/lib/content/pipeline/stages.ts`) is deterministic template/
  heuristic logic, not an LLM call, regardless of whether a key is
  configured — this keeps a full pipeline run exercisable and testable
  without incurring or faking real API usage.
- **AI Visibility checks**: a deterministic demo adapter for every
  platform except ChatGPT; ChatGPT itself also falls back to demo unless
  `OPENAI_API_KEY` is set.
- **Competitor gap analysis**: always a deterministic demo adapter (no
  live crawl or LLM call in this build).

Every demo/simulated value is labeled "Demo" in the UI (see the
live/estimated/demo convention in `src/lib/analytics/data-labels.ts`),
and the app will **never** call a real external provider without the
matching credential configured — there is no silent fallback that
pretends to be a real API response.

You still need a real Supabase project for the database itself (RLS,
Auth, Postgres) — there is no local-only/offline mode for the data
plane. `DATABASE_URL` + `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` are
required even if `OPENAI_API_KEY` is not.

## Demo login

After running `npm run db:seed` **with `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` configured**, the seed script creates a real
Supabase Auth user via the Admin API (`supabase.auth.admin.createUser`)
and you can log in immediately at `/login`:

- **Email**: `demo@curlco.northlight.test`
- **Password**: `NorthlightDemo123!`

This is a **local/demo-only** account for exploring the seeded "Curl Co"
tween-haircare brand — it is never a real secret, is always the same
fixed value defined in `scripts/seed-data.ts`, and should never be reused
for a production deployment or a real user account. Re-running
`npm run db:seed` updates this user's password back to the value above
if it's ever changed.

If `SUPABASE_SERVICE_ROLE_KEY` isn't configured when you seed, the
script skips real auth-user creation (it can't call the Admin API
without that key) and logs a warning — the demo brand/data still seeds
correctly for schema/data-shape purposes, but you won't be able to log
in as the demo user until you configure the key and re-run the seed.

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | ESLint (`next lint`). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Full Vitest suite (unit + integration). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run db:generate` | Regenerate SQL migrations from `src/db/schema/*.ts` via drizzle-kit. |
| `npm run db:migrate` | Apply `src/db/migrations/*.sql` directly to `DATABASE_URL`. |
| `npm run db:seed` | Seed the "Curl Co" demo brand (idempotent — safe to re-run). |
| `npm run worker` | Process every currently-due queued job once, then exit — see ARCHITECTURE.md for why this is a one-shot script, not a daemon, and how to schedule it. |

## Deployment

See ARCHITECTURE.md for the system design this deploys, and DATABASE.md
for the schema/migration/RLS details referenced below.

### 1. Create a Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. In Project Settings -> Database, copy the connection string into
   `DATABASE_URL` (use the "connection pooling" string for serverless
   deployments, per Supabase's own guidance for Vercel).
3. In Project Settings -> API, copy the Project URL into
   `NEXT_PUBLIC_SUPABASE_URL`, the `anon` public key into
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the `service_role` key into
   `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose this to the
   client).
4. Enable the `pgvector` extension: SQL Editor ->
   `create extension if not exists vector;`

### 2. Run migrations

```bash
npm run db:migrate
```

This applies every file in `src/db/migrations/` in order (schema +
RLS policies), against the real `DATABASE_URL` from step 1.

### 3. Required post-migration SQL (auth trigger)

Migrations don't include this because it depends on Supabase's `auth`
schema, which doesn't exist in the local pglite test harness. Run once,
in the Supabase SQL Editor, against your real project (see DATABASE.md
for the full explanation):

```sql
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 4. (Optional) Seed demo data

```bash
npm run db:seed
```

### 5. Deploy the app to Vercel

**Note**: the steps below are exact instructions for *you* to follow in
Vercel's own dashboard — connecting a Vercel project and entering real
secret values requires your own Vercel/GitHub account access, which
nothing in this repo or any automated process can do on your behalf.

1. Go to [vercel.com/new](https://vercel.com/new) and import this
   GitHub repository (`Mrudula-itsjuzme/northlight` or your fork).
2. Framework preset: Vercel auto-detects **Next.js** from `package.json`
   — no manual configuration needed. Leave the build command
   (`next build`) and output directory at their defaults.
3. Before the first deploy, open **Project Settings -> Environment
   Variables** and add every row below (values come from step 1 above
   and, for `JOBS_WORKER_SECRET`, any random string you generate
   yourself, e.g. `openssl rand -hex 32`):

   | Variable | Required? | What breaks / falls back if omitted |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | **Required** | App cannot reach Supabase at all; every page that touches the database throws. |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required** | Same as above — auth and all RLS-scoped reads/writes fail without it. |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Background worker, Brand Brain document storage upload, and demo seeding lose privileged access; Brand Brain uploads still work (falls back to storing extracted text only, no original file in Storage — see the doc comment on `uploadBrandDocument`), but the worker and seed script cannot run. |
   | `DATABASE_URL` | **Required** | Drizzle (typed queries used by every server action, the worker, and scripts) cannot connect; the app effectively cannot run. |
   | `OPENAI_API_KEY` | Optional | Without it, Northlight runs entirely on deterministic demo adapters for embeddings, brief/article generation, and AI visibility checks — all clearly labeled "Demo" in the UI (see `DataBadge`). Northlight never calls a real provider without this key, and never fakes a "success" response from one. |
   | `OPENAI_CHAT_MODEL` / `OPENAI_EMBEDDING_MODEL` | Optional | Only read if `OPENAI_API_KEY` is set; otherwise ignored. Default to `gpt-4o-mini` / `text-embedding-3-small` if unset. |
   | `NEXT_PUBLIC_APP_URL` | Optional | Used to build absolute links (e.g. invite emails). Defaults to `http://localhost:3000`, which is wrong in production — set this to your real deployed URL. |
   | `JOBS_WORKER_SECRET` | Required for the background worker | Without it, the worker route (step 6 below) cannot be safely exposed at a public URL; the rest of the app still works, but queued jobs (embeddings, pipeline runs, gap reports) never get processed. |

   No new environment variable was introduced for this hardening pass's
   rate limiter (`src/lib/rate-limit.ts`) — it is in-process and
   configuration-free; see `SECURITY.md` for its documented limitation
   under a multi-instance deployment.
4. Click **Deploy**. Vercel builds with `next build` and serves the app;
   every subsequent push to the connected branch redeploys automatically
   via Vercel's own GitHub integration (this is separate from, and not
   duplicated by, the CI workflow in `.github/workflows/ci.yml`, which
   only runs lint/typecheck/test/build checks on push/PR and never
   deploys anything).

### 6. Set up the background worker on a schedule

The worker (`npm run worker`) is a one-shot script — it processes every
currently-due job, then exits (see ARCHITECTURE.md's "Worker execution
model" for why this shape, not a daemon). On Vercel, the recommended
approach is Vercel Cron:

1. Add a small API route (e.g. `src/app/api/jobs/run/route.ts`) that
   checks a shared secret (`JOBS_WORKER_SECRET` from `.env.example`)
   and calls `runWorkerOnce()` from `src/lib/jobs/worker.ts`.
2. Add a `vercel.json` with a `crons` entry pointing at that route on
   whatever interval fits your workload (e.g. every minute):
   ```json
   {
     "crons": [{ "path": "/api/jobs/run", "schedule": "* * * * *" }]
   }
   ```
3. Alternatively, if you'd rather not add a route, run
   `npm run worker` on any external scheduler (a small VM/container's
   cron, a scheduled GitHub Action, Supabase's `pg_cron` + `pg_net`
   calling out to an HTTP endpoint) — any of these are equally valid per
   ARCHITECTURE.md's "no Redis/BullMQ" rationale.

### Credentials this sandbox build could NOT verify against a live environment

This build was produced without a real Supabase project or OpenAI API
key configured. Every piece of code that would call a real external
service is written against that service's real request/response shape,
but has never executed against the live endpoint — see
`IMPLEMENTATION_PLAN.md`'s per-phase status log for the exact,
itemized list of what's "genuinely not exercised in this sandbox" per
phase. Providing `DATABASE_URL` (a real Supabase Postgres connection)
and, optionally, `OPENAI_API_KEY` would unlock full end-to-end
verification.
