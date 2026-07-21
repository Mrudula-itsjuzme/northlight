"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  signupSchema,
  loginSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
  updateProfileSchema,
  type SignupInput,
  type LoginInput,
  type RequestPasswordResetInput,
  type UpdatePasswordInput,
  type UpdateProfileInput,
} from "@/lib/validation/auth";

export type AuthActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Signs a new user up via Supabase Auth (`supabase.auth.signUp`). Supabase
 * sends the confirmation email itself using the project's configured email
 * provider; the emailRedirectTo points at our `/api/auth/callback` route,
 * which exchanges the confirmation code for a session. This calls the real
 * Supabase Auth API — if `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * are not configured, `createClient()` throws a clear, visible error rather
 * than silently no-opping.
 */
export async function signup(input: SignupInput): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/api/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (data.session) {
    // Email confirmations disabled on this Supabase project — user is
    // signed in immediately.
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  return {
    ok: true,
    message: "Check your email to confirm your account before signing in.",
  };
}

export async function login(input: LoginInput): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/** Sends a password-reset email via Supabase Auth. */
export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<AuthActionResult> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${siteUrl()}/api/auth/callback?next=/reset-password/confirm` },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
  };
}

/**
 * Completes a password reset. Must be called with an active recovery
 * session (established by the `/api/auth/callback` route after the user
 * clicks the emailed link).
 */
export async function updatePassword(
  input: UpdatePasswordInput,
): Promise<AuthActionResult> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, message: "Password updated. You can now sign in." };
}

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<AuthActionResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { error } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.fullName },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated." };
}
