"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Check, Plus, Building2 } from "lucide-react";
import { switchActiveBrand, type BrandListItem } from "@/lib/brands/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BrandSwitcher({
  brands,
  activeBrandId,
}: {
  brands: BrandListItem[];
  activeBrandId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];

  function handleSwitch(brandId: string) {
    setOpen(false);
    startTransition(async () => {
      const result = await switchActiveBrand(brandId);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  const initial = active?.name ? active.name.charAt(0).toUpperCase() : "B";

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-2.5 py-5 hover:bg-accent/50 border border-transparent hover:border-border/60 transition-all rounded-lg"
          disabled={isPending}
        >
          <div className="flex items-center gap-2.5 truncate">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-tr from-violet-500 to-indigo-600 font-bold text-white text-xs shadow-sm">
              {initial}
            </div>
            <span className="truncate text-sm font-semibold text-foreground/90">
              {active ? active.name : "Select a brand"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-50 min-w-[240px] rounded-xl border border-border/80 glass-panel p-1.5 text-popover-foreground shadow-xl animate-fade-in-up"
        >
          {brands.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No brands registered yet
            </div>
          )}
          {brands.map((brand) => {
            const isSelected = brand.id === active?.id;
            return (
              <DropdownMenu.Item
                key={brand.id}
                onSelect={() => handleSwitch(brand.id)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors",
                  isSelected
                    ? "bg-primary/10 text-primary font-semibold"
                    : "hover:bg-accent hover:text-accent-foreground text-foreground/80",
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{brand.name}</span>
                </div>
                {isSelected && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenu.Item>
            );
          })}
          <DropdownMenu.Separator className="my-1.5 h-px bg-border/60" />
          <DropdownMenu.Item
            onSelect={() => router.push("/brands/new")}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary outline-none hover:bg-primary/10 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add New Brand
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
