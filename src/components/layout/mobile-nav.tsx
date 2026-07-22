"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import type { BrandListItem } from "@/lib/brands/actions";
import { BrandSwitcher } from "@/components/brands/brand-switcher";

/**
 * Mobile/tablet navigation: a hamburger button (visible below the `lg`
 * breakpoint, where the fixed sidebar in `AppLayout` is hidden) that opens
 * a slide-in drawer with the same brand switcher / nav links / user menu
 * as the desktop sidebar, via Radix Dialog (already a project dependency)
 * rather than introducing a new primitive.
 */
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
      <div className="flex items-center justify-between border-b bg-card px-4 py-3 lg:hidden">
        <div className="text-lg font-bold tracking-tight">Northlight</div>
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-card p-4 shadow-lg lg:hidden">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold tracking-tight">Northlight</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation menu">
                <X className="h-5 w-5" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="mb-6" onClick={() => setOpen(false)}>
            <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
          </div>
          <div className="flex-1" onClick={() => setOpen(false)}>
            <SidebarNav />
          </div>
          <div className="mt-6 border-t pt-4">
            <UserMenu email={email} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
