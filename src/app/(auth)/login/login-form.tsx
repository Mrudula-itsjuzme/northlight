"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { isRedirectError } from "@/lib/utils";
import { Mail, Lock, ArrowRight, Sparkles } from "lucide-react";

export function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [serverError, setServerError] = useState<string | null>(urlError);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await login(values);
      if (result && !result.ok) {
        setServerError(result.error);
      }
    } catch (err) {
      if (isRedirectError(err)) return;
      setServerError(err instanceof Error ? err.message : "An unexpected error occurred during sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <ErrorState message={serverError} />}

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email Address
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          {...register("email")}
        />
        {errors.email && <p className="text-xs text-rose-400 font-medium">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          {...register("password")}
        />
        {errors.password && <p className="text-xs text-rose-400 font-medium">{errors.password.message}</p>}
      </div>

      <Button type="submit" variant="gradient" className="w-full shadow-glow" disabled={pending}>
        {pending ? (
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-spin" /> Signing in...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Sign In <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  );
}
