# Security

This document covers what Northlight's MVP hardening pass addresses, how
each control works, and what is explicitly out of scope for now. See
`DATABASE.md` for the full RLS/tenancy model and `ARCHITECTURE.md` for the
overall system design.

## What's covered

### Tenant isolation (Row Level Security)

Every tenant-owned table (`stores`, `products`, `brand_documents`,
`keywords`, `competitors`, `competitor_pages`, `gap_reports`,
`content_briefs`, `content_pipeline_runs`, `articles`, `ai_prompts`,
`ai_visibility_snapshots`, `recommendations`, `analytics_events`,
`subscriptions`, `usage_events`, `jobs`, and others — see
`src/db/migrations/0001_rls_policies.sql`) has Row Level Security enabled
with a policy requiring `public.is_brand_member(brand_id)`: a row is only
visible/writable to a user who has a `brand_members` row for that brand.
This is enforced at the Postgres layer, not just in application code, so it
holds even if a server action has a bug. Role-gated actions (e.g. only
owner/admin can invite members, only owner can change roles) are enforced
in the application layer on top of RLS (`src/lib/brands/require-role.ts`),
since that needs richer error messages than a blanket RLS denial can give —
RLS is the last line of defense for tenant *read* isolation, which is
covered by `tests/integration/tenant-isolation.test.ts`.

### No service-role key in client code

`createServiceRoleClient()` (`src/lib/supabase/server.ts`) bypasses RLS
entirely and is used only by the background worker, admin scripts, and
seed/demo data setup. It is marked in a doc comment as server-only, and is
never imported by any `"use client"` file — verified by grepping every file
that imports it or references `SUPABASE_SERVICE_ROLE_KEY` and confirming
none carry a `"use client"` directive. The browser-side Supabase client
(`src/lib/supabase/client.ts`) uses only the public anon key, which is safe
to expose because RLS — not key secrecy — is what enforces access control
for that client.

### Security headers (`next.config.mjs`)

Applied to every route via `headers()`:

- **Content-Security-Policy**: `default-src 'self'`, `connect-src`/`img-src`
  scoped to `'self'` plus the exact Supabase project origin (derived from
  `NEXT_PUBLIC_SUPABASE_URL` at build time), `frame-ancestors 'none'`,
  `object-src 'none'`, no `unsafe-eval` anywhere. `script-src` includes
  `'unsafe-inline'` because Next.js 14 App Router injects inline
  `<script>` tags with no `src` to stream the React Server Components
  payload (`self.__next_f.push(...)`) — verified directly against this
  app's own build output, not assumed. `style-src` is strict (`'self'`
  only, no `unsafe-inline`) since the app has zero inline styles.
- **X-Frame-Options: DENY** — the app can never be framed, mitigating
  clickjacking.
- **X-Content-Type-Options: nosniff** — stops the browser from MIME-sniffing
  responses away from their declared Content-Type.
- **Referrer-Policy: strict-origin-when-cross-origin**.
- **Permissions-Policy**: disables camera, microphone, geolocation,
  payment, USB, and FLoC (`interest-cohort`) — none of these are used by
  the app.

### Upload validation (Brand Brain documents)

`src/lib/brand-brain/validate-upload.ts`, called from
`uploadBrandDocument` (`src/lib/brand-brain/actions.ts`) before any
extraction/storage happens:

- **Size cap**: 10MB (`MAX_UPLOAD_BYTES`), rejecting oversized buffers
  before they're passed to the PDF/DOCX parsers (which hold the full
  buffer in memory).
- **Content sniffing, not just extension**: PDFs are checked for the
  `%PDF-` magic header; DOCX files are checked for the ZIP container magic
  bytes (`PK\x03\x04` / `PK\x05\x06`, since DOCX is a ZIP archive); TXT/CSV
  are checked with a binary-content heuristic (rejects buffers containing
  NUL bytes or a high proportion of non-printable, non-whitespace control
  characters). The client's `accept=".txt,.csv,.pdf,.docx"` attribute on
  the file input is a UI hint only — it does not and cannot enforce
  anything, since a client can send arbitrary bytes under any filename.
- Rejections return a typed reason (`too_large` / `empty` /
  `content_mismatch` / `unsupported_type`) and a user-facing error message,
  never a silent failure or a generic 500.

### Rate limiting

`src/lib/rate-limit.ts` implements an in-process token-bucket limiter keyed
by `${action}:${brandId}` (see `RATE_LIMITS` for the exact per-action
presets), applied to:

- Content brief generation and content pipeline runs (`src/lib/content/actions.ts`)
- AI visibility snapshot runs (`src/lib/ai/visibility/actions.ts`)
- Brand document uploads (`src/lib/brand-brain/actions.ts`)
- Invite sending (`src/lib/brands/actions.ts`)

This bounds the most expensive/abusable server actions (LLM calls when
configured, PDF/DOCX parsing, fan-out across 6 AI platform adapters,
invite-email/token generation) against a single tenant hammering them,
whether by accident (a buggy client retry loop) or intentionally.

**Important limitation, documented in the module itself**: this is an
in-process limiter (a plain `Map`), so it only limits requests hitting the
*same server instance*. On a multi-instance/serverless deployment (e.g.
Vercel), each instance gets its own bucket — the effective limit becomes
"N per action per instance" rather than a true global limit. The
`consume()`/`checkRateLimit()` interface is intentionally storage-agnostic
so a real production deployment under sustained multi-instance load can
swap the in-memory `Map` for a shared store (e.g. Upstash Redis via
`@upstash/ratelimit`) without changing any call site.

### No hardcoded secrets

Verified by grepping for common secret patterns (OpenAI `sk-` keys, JWTs,
inline Postgres connection strings with embedded credentials) across
`src/` and `scripts/` — none found. All credentials are read from
`process.env`, documented in `.env.example` with placeholder (empty)
values, and `.gitignore` excludes `.env*` (see below).

## What's explicitly out of scope for this MVP

- **Distributed rate limiting.** The current limiter is single-instance
  in-process only (see above). A real multi-instance production deployment
  needs a shared backing store.
- **Web Application Firewall (WAF) / DDoS protection.** Left to the
  hosting platform (Vercel provides some baseline protection) rather than
  implemented in-app.
- **Formal penetration testing / third-party security audit.** Nothing in
  this repo has been externally pen-tested.
- **Secrets rotation / vaulting.** Env vars are static; there is no
  automated rotation policy or integration with a secrets manager (e.g.
  Vault, AWS Secrets Manager). Rotating `SUPABASE_SERVICE_ROLE_KEY` or
  `OPENAI_API_KEY` today means manually updating them in Vercel's
  dashboard and redeploying.
- **CSRF tokens beyond Next.js/Supabase defaults.** Server Actions rely on
  Next.js's built-in same-origin enforcement for mutation requests;
  cookies are `sameSite: "lax"`. No additional custom CSRF token scheme is
  layered on top.
- **Content Security Policy nonces.** The CSP currently uses
  `'unsafe-inline'` for `script-src` because Next.js 14 App Router injects
  inline RSC-hydration scripts (see above). A nonce-based CSP is possible
  but requires threading a per-request nonce through middleware and the
  root layout — left as a future improvement, not done in this pass.
- **Automated dependency/vulnerability scanning (e.g. Dependabot, Snyk) as
  a gating CI step.** Not wired into `.github/workflows/ci.yml` in this
  pass.
