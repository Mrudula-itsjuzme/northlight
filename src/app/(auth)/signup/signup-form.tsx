"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { signup } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { User, Mail, Lock, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    setSuccessMessage(null);
    setPending(true);
    try {
      const result = await signup(values);
      if (result) {
        if (!result.ok) {
          setServerError(result.error);
        } else if (result.message) {
          setSuccessMessage(result.message);
        }
      }
    } catch (err) {
      if (typeof err === "object" && err !== null && "message" in err && String(err.message).includes("NEXT_REDIRECT")) {
        return;
      }
      setServerError(err instanceof Error ? err.message : "An unexpected error occurred during sign up.");
    } finally {
      setPending(false);
    }
  }

  if (successMessage) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Account Created!</p>
          <p className="text-xs text-muted-foreground mt-1">{successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <ErrorState message={serverError} />}

      <div className="space-y-1.5">
        <Label htmlFor="fullName" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-muted-foreground" /> Full Name
        </Label>
        <Input id="fullName" autoComplete="name" placeholder="Alex Morgan" {...register("fullName")} />
        {errors.fullName && <p className="text-xs text-rose-400 font-medium">{errors.fullName.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email Address
        </Label>
        <Input id="email" type="email" autoComplete="email" placeholder="alex@company.com" {...register("email")} />
        {errors.email && <p className="text-xs text-rose-400 font-medium">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          {...register("password")}
        />
        {errors.password && <p className="text-xs text-rose-400 font-medium">{errors.password.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Confirm Password
        </Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-rose-400 font-medium">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" variant="gradient" className="w-full shadow-glow" disabled={pending}>
        {pending ? (
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-spin" /> Creating Account...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Create Account <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  );
}
