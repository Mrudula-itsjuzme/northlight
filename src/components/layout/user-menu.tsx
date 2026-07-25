"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Sparkles } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function UserMenu({ email }: { email: string | null }) {
  const initial = email ? email.charAt(0).toUpperCase() : "U";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-3 px-2 py-5 hover:bg-accent/60">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 font-bold text-white text-xs shadow-sm">
            {initial}
          </div>
          <div className="flex flex-col items-start truncate text-left">
            <span className="truncate text-xs font-semibold text-foreground">{email ?? "Account"}</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-violet-400" /> Growth Tier
            </span>
          </div>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-50 min-w-[220px] rounded-xl border border-border/80 glass-panel p-1.5 text-popover-foreground shadow-xl animate-fade-in-up"
        >
          <div className="px-3 py-2 border-b border-border/60 mb-1">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="text-xs font-semibold truncate text-foreground">{email ?? "User"}</p>
          </div>
          <DropdownMenu.Item asChild>
            <form action={logout} className="w-full">
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-destructive outline-none hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </form>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
