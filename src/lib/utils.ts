import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isRedirectError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const msg = "message" in err ? String((err as { message?: unknown }).message) : "";
  const digest = "digest" in err ? String((err as { digest?: unknown }).digest) : "";
  return msg.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT");
}
