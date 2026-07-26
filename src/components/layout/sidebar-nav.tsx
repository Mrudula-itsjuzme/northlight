"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Search,
  Radar,
  FileText,
  Eye,
  Lightbulb,
  BarChart3,
  Settings,
  ChevronRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brand-brain", label: "Brand Brain", icon: Sparkles, badge: "AI" },
  { href: "/keywords", label: "Keyword Explorer", icon: Search },
  { href: "/competitors", label: "Competitor Radar", icon: Radar },
  { href: "/content", label: "Content Pipeline", icon: FileText },
  { href: "/visibility", label: "AI Visibility", icon: Eye, badge: "Live" },
  { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/diagnostics", label: "Diagnostics", icon: Activity, badge: "System" },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1.5 px-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary/10 text-primary font-semibold shadow-glow-sm"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary shadow-glow" />
            )}
            <div className="flex items-center gap-3">
              <Icon
                className={cn(
                  "h-4 w-4 transition-transform duration-200 group-hover:scale-110",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span>{item.label}</span>
            </div>

            {item.badge ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  item.badge === "AI"
                    ? "bg-violet-500/15 text-violet-500 border border-violet-500/20"
                    : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20",
                )}
              >
                {item.badge}
              </span>
            ) : isActive ? (
              <ChevronRight className="h-3.5 w-3.5 text-primary/70" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
