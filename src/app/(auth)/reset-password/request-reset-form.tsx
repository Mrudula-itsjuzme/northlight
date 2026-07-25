"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Mail, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

export function RequestResetForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
  });

  async function onSubmit(values: RequestPasswordResetInput) {
    setServerError(null);
    setSuccessMessage(null);
    setPending(true);
    try {
      const result = await requestPasswordReset(values);
      if (!result.ok) {
        setServerError(result.error);
      } else {
        setSuccessMessage(result.message ?? "Check your email for a reset link.");
      }
    } catch (err) {
      if (typeof err === "object" && err !== null && "message" in err && String(err.message).includes("NEXT_REDIRECT")) {
        return;
      }
      setServerError(err instanceof Error ? err.message : "Failed to request password reset.");
    } finally {
      setPending(false);
    }
  }

  if (successMessage) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 flex items-start gap-2.5 font-medium">
        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">Reset Email Sent</p>
          <p className="mt-0.5 text-muted-foreground">{successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <ErrorState message={serverError} />}

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email Address
        </Label>
        <Input id="email" type="email" autoComplete="email" placeholder="name@company.com" {...register("email")} />
        {errors.email && <p className="text-xs text-rose-400 font-medium">{errors.email.message}</p>}
      </div>

      <Button type="submit" variant="gradient" className="w-full shadow-glow" disabled={pending}>
        {pending ? (
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-spin" /> Sending Link...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Send Reset Link <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  );
}
