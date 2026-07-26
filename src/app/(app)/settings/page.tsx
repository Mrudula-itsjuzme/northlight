import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brands, brandMembers, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getActiveBrandId, listBrandsForUser } from "@/lib/brands/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ShieldCheck, Users, User, Globe, Tag, CheckCircle2, Lock } from "lucide-react";
import { DataBadge } from "@/components/ui/data-badge";
import { isBrandDemo } from "@/lib/brands/actions";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeBrandId = await getActiveBrandId();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const db = getDb();

  // Fetch active brand details
  const [activeBrand] = await db
    .select()
    .from(brands)
    .where(eq(brands.id, activeBrandId))
    .limit(1);

  // Fetch brand members
  const memberRows = await db
    .select({
      memberId: brandMembers.id,
      userId: brandMembers.userId,
      role: brandMembers.role,
      email: profiles.email,
      fullName: profiles.fullName,
      createdAt: brandMembers.createdAt,
    })
    .from(brandMembers)
    .leftJoin(profiles, eq(brandMembers.userId, profiles.id))
    .where(eq(brandMembers.brandId, activeBrandId));

  const isDemo = await isBrandDemo(activeBrandId);
  const userBrandsResult = await listBrandsForUser();
  const userBrands = userBrandsResult.ok ? userBrandsResult.data : [];

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-4">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Workspace Settings</h1>
            {isDemo && <DataBadge kind="demo" />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your brand details, team members, security policies, and workspace configurations.
          </p>
        </div>
      </div>

      {/* Brand Workspace Card */}
      <Card className="glass-panel border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-card/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Brand Profile</CardTitle>
                <CardDescription>Core identity and tenancy information for this workspace</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-medium">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Active Workspace
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1.5 p-4 rounded-xl border border-border/60 bg-accent/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" /> Brand Name
              </span>
              <p className="text-base font-bold text-foreground">{activeBrand?.name ?? "N/A"}</p>
            </div>

            <div className="space-y-1.5 p-4 rounded-xl border border-border/60 bg-accent/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-primary" /> Industry / Vertical
              </span>
              <p className="text-base font-bold text-foreground">{activeBrand?.vertical ?? "Unspecified"}</p>
            </div>

            <div className="space-y-1.5 p-4 rounded-xl border border-border/60 bg-accent/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" /> Website URL
              </span>
              <p className="text-base font-bold text-foreground truncate">
                {activeBrand?.websiteUrl ? (
                  <a
                    href={activeBrand.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {activeBrand.websiteUrl}
                  </a>
                ) : (
                  "Not set"
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border/40 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground/80">Slug: {activeBrand?.slug}</span>
              <span>•</span>
              <span>Workspace ID: {activeBrand?.id}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
              <ShieldCheck className="h-4 w-4" /> Row Level Security (RLS) Enforced
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Members Card */}
      <Card className="glass-panel border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-card/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Team & Permissions</CardTitle>
              <CardDescription>Members with access to this brand workspace</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="divide-y divide-border/40">
            {memberRows.map((member) => (
              <div key={member.memberId} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-semibold text-xs text-foreground uppercase">
                    {member.email?.slice(0, 2) ?? "US"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {member.fullName || member.email || "Team Member"}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={member.role === "owner" ? "default" : "secondary"} className="capitalize">
                    {member.role}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User & Security Account Details */}
      <Card className="glass-panel border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-card/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <User className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">User Account & Authentication</CardTitle>
              <CardDescription>Your personal credentials and platform role</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-1">Authenticated Email</span>
              <p className="font-semibold text-foreground">{user.email}</p>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-1">Supabase User ID</span>
              <p className="font-mono text-xs text-muted-foreground truncate">{user.id}</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-emerald-500" /> Multi-Tenant Isolation Active
            </span>
            <span className="font-medium text-foreground">
              {userBrands.length} Brand Workspace{userBrands.length === 1 ? "" : "s"} Accessible
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
