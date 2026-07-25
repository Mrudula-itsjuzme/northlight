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

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string" &&
    (err as { message: string }).message.includes("NEXT_REDIRECT")
  );
}

/**
 * Signs a new user up via Supabase Auth (`supabase.auth.signUp`).
 */
export async function signup(input: SignupInput): Promise<AuthActionResult> {
  let shouldRedirect = false;
  try {
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
      revalidatePath("/", "layout");
      shouldRedirect = true;
    } else {
      return {
        ok: true,
        message: "Check your email to confirm your account before signing in.",
      };
    }
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to sign up. Please try again.",
    };
  }

  if (shouldRedirect) {
    redirect("/onboarding");
  }

  return { ok: true };
}

export async function login(input: LoginInput): Promise<AuthActionResult> {
  let shouldRedirect = false;
  try {
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
    shouldRedirect = true;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to sign in. Please try again.",
    };
  }

  if (shouldRedirect) {
    redirect("/dashboard");
  }

  return { ok: true };
}

export async function logout(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
  } catch {
    // Ignore signOut errors on logout
  }
  redirect("/login");
}

/** Sends a password-reset email via Supabase Auth. */
export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<AuthActionResult> {
  try {
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
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to request password reset.",
    };
  }
}

/**
 * Completes a password reset.
 */
export async function updatePassword(
  input: UpdatePasswordInput,
): Promise<AuthActionResult> {
  try {
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
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update password.",
    };
  }
}

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<AuthActionResult> {
  try {
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
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update profile.",
    };
  }
}
