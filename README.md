# Northlight

Northlight is an **AI Growth OS for D2C brands** — a single Next.js app
that helps a brand find high-priority keywords, spot competitor content
gaps, run keyword briefs through a content pipeline, track how visible
the brand is in AI assistant answers (ChatGPT, Claude, Gemini,
Perplexity, Copilot, AI Overviews), and get a ranked list of what to do
next — all backed by one Supabase Postgres database with tenant
isolation via Row Level Security.

See `ARCHITECTURE.md` for the system design, `DATABASE.md` for the
schema/RLS model, and `AI_SCORING.md` for every scoring/parsing formula
with worked numeric examples.

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

1. Import the repository into Vercel.
2. Set every variable from `.env.example` in Vercel's Project Settings ->
   Environment Variables (matching the values from step 1, plus
   `OPENAI_API_KEY` if you want real embeddings/generation instead of
   demo adapters).
3. Deploy. Vercel builds with `next build` and serves the app.

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
