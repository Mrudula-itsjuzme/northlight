/** @type {import('next').NextConfig} */

// Derive the Supabase project origin from the public URL env var so the CSP
// can scope `connect-src`/`img-src` to exactly that origin (auth, Storage,
// browser-client calls) instead of a wildcard. Falls back to
// `https://*.supabase.co` when the env var isn't set at build time (e.g. a
// CI lint/build run with no `.env.local`), so `next build` never crashes for
// lack of Supabase config — mirrors the same non-crashing pattern used in
// `src/lib/supabase/client.ts`.
function supabaseOrigin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co";
  try {
    return new URL(url).origin;
  } catch {
    return "https://*.supabase.co";
  }
}

// `script-src` must allow 'unsafe-inline': Next.js App Router (14.x) injects
// small inline `<script>` tags with no `src` attribute to stream the React
// Server Components payload into the client (`self.__next_f.push(...)`).
// Verified directly against this app's own build output (`next build` +
// `next start`, inspecting rendered HTML for /login): 5 inline <script>
// tags with no `src`, 0 inline <style> tags. A nonce-based CSP (Next's
// documented alternative) would remove the need for 'unsafe-inline' on
// script-src, but requires threading a per-request nonce through
// middleware AND the root layout — a materially bigger change than this
// hardening pass's blast radius justifies. No 'unsafe-eval' is used
// anywhere and none is granted. `style-src` stays strict ('self' only)
// since the app has zero inline styles — Tailwind compiles to an external
// stylesheet.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self'`,
  `img-src 'self' data: blob: ${supabaseOrigin()}`,
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseOrigin()}`,
  `frame-src 'none'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "payment=()",
              "usb=()",
              "interest-cohort=()",
            ].join(", "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
