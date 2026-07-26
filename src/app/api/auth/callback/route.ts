import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profiles/upsert";

/**
 * Supabase redirects here after email confirmation / magic-link / password
 * recovery clicks, with a `code` query param. We exchange it for a session
 * (sets the auth cookies via the server client's `setAll`), then redirect
 * on to `next` (defaults to onboarding for new signups).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      try {
        await ensureProfile(data.user);
      } catch (profileErr) {
        console.error("[auth callback profile upsert error]:", profileErr);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "Authentication failed.")}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Missing confirmation code.")}`,
  );
}
