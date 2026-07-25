import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateBrandForm } from "./create-brand-form";
import { Building2, ShieldCheck } from "lucide-react";

export default function NewBrandPage() {
  return (
    <div className="mx-auto max-w-lg space-y-8 pt-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-glow-sm">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">Create Brand Workspace</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Each brand is an isolated tenant workspace protected by Row Level Security (RLS) with dedicated keywords, competitors, and content.
        </p>
      </div>

      <Card glass>
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle>Brand Configuration</CardTitle>
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> RLS Isolated
            </span>
          </div>
          <CardDescription>You will be assigned as Owner of this brand workspace.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <CreateBrandForm />
        </CardContent>
      </Card>
    </div>
  );
}
