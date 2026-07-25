"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import type { BrandListItem } from "@/lib/brands/actions";
import { BrandSwitcher } from "@/components/brands/brand-switcher";

export function MobileNav({
  email,
  brands,
  activeBrandId,
}: {
  email: string | null;
  brands: BrandListItem[];
  activeBrandId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between border-b border-border/80 glass-panel px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 via-purple-600 to-cyan-500 text-white shadow-glow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gradient-purple">Northlight</span>
        </div>
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5 text-foreground" />
          </Button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-fade-in-up" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border/80 glass-panel p-5 shadow-2xl shadow-violet-500/20 lg:hidden">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 via-purple-600 to-cyan-500 text-white shadow-glow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <Dialog.Title className="text-lg font-bold tracking-tight text-gradient-purple">Northlight</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation menu">
                <X className="h-5 w-5 text-muted-foreground" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="mb-6 rounded-xl border border-border/60 bg-card/60 p-2 backdrop-blur-sm shadow-sm" onClick={() => setOpen(false)}>
            <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
          </div>
          <div className="flex-1 overflow-y-auto" onClick={() => setOpen(false)}>
            <SidebarNav />
          </div>
          <div className="mt-6 border-t border-border/60 pt-4">
            <UserMenu email={email} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
