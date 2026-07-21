"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Check, Plus } from "lucide-react";
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

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          disabled={isPending}
        >
          <span className="truncate">
            {active ? active.name : "Select a brand"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-50 min-w-[220px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {brands.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No brands yet
            </div>
          )}
          {brands.map((brand) => (
            <DropdownMenu.Item
              key={brand.id}
              onSelect={() => handleSwitch(brand.id)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent",
              )}
            >
              <span className="truncate">{brand.name}</span>
              {brand.id === active?.id && <Check className="h-4 w-4" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => router.push("/brands/new")}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Create brand
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
