"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updatePasswordSchema,
  type UpdatePasswordInput,
} from "@/lib/validation/auth";
import { updatePassword } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { isRedirectError } from "@/lib/utils";
import { Lock, ArrowRight, Sparkles } from "lucide-react";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
  });

  async function onSubmit(values: UpdatePasswordInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await updatePassword(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      router.push("/login");
    } catch (err) {
      if (isRedirectError(err)) return;
      setServerError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <ErrorState message={serverError} />}

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" /> New Password
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
          <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Confirm New Password
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
            <Sparkles className="h-4 w-4 animate-spin" /> Updating Password...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Update Password <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  );
}
