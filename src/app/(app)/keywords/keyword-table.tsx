"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  deleteKeyword,
  generateBriefFromKeyword,
  generateKeywordClusters,
  rescoreKeywords,
  type ListKeywordsResult,
} from "@/lib/keywords/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataBadge } from "@/components/ui/data-badge";
import { Search, RefreshCw, Layers, ArrowUpDown, Trash2, FilePlus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type SortBy = "priorityScore" | "rawVolume" | "rawDifficulty" | "term" | "createdAt";

export function KeywordTable({
  brandId,
  result,
  search,
  sortBy,
  sortDir,
}: {
  brandId: string;
  result: ListKeywordsResult;
  search: string;
  sortBy: SortBy;
  sortDir: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [searchValue, setSearchValue] = useState(search);

  function updateParams(next: Record<string, string | number>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      params.set(key, String(value));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function onSort(column: SortBy) {
    const nextDir = sortBy === column && sortDir === "desc" ? "asc" : "desc";
    updateParams({ sortBy: column, sortDir: nextDir, page: 1 });
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParams({ search: searchValue, page: 1 });
  }

  async function onDelete(keywordId: string) {
    setPendingId(keywordId);
    try {
      await deleteKeyword(brandId, keywordId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function onGenerateBrief(keywordId: string) {
    setPendingId(keywordId);
    try {
      const res = await generateBriefFromKeyword(brandId, keywordId);
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setPendingId(null);
    }
  }

  async function onRescore() {
    setBulkPending(true);
    try {
      await rescoreKeywords(brandId);
      router.refresh();
    } finally {
      setBulkPending(false);
    }
  }

  async function onCluster() {
    setBulkPending(true);
    try {
      await generateKeywordClusters(brandId);
      router.refresh();
    } finally {
      setBulkPending(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <form onSubmit={onSearchSubmit} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search keyword terms..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 bg-card/60"
          />
        </form>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCluster} disabled={bulkPending} className="gap-1.5">
            <Layers className="h-4 w-4 text-cyan-400" />
            <span>Generate Clusters</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onRescore} disabled={bulkPending} className="gap-1.5">
            <RefreshCw className={cn("h-4 w-4 text-violet-400", bulkPending && "animate-spin")} />
            <span>Rescore All</span>
          </Button>
        </div>
      </div>

      {/* Glass Data Table */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40 backdrop-blur-md shadow-lg">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-card/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Term" column="term" activeSort={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortableHeader label="Volume" column="rawVolume" activeSort={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortableHeader label="Difficulty" column="rawDifficulty" activeSort={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortableHeader label="Priority Score" column="priorityScore" activeSort={sortBy} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {result.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No keywords found in repository. Add or import terms to get started.
                </td>
              </tr>
            )}
            {result.items.map((kw) => {
              const score = kw.priorityScore !== null ? kw.priorityScore : 0;
              const isHighPriority = score >= 0.7;

              return (
                <tr key={kw.id} className="group hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-foreground">{kw.term}</td>
                  <td className="px-4 py-3.5 tabular-nums text-foreground/90">{kw.rawVolume.toLocaleString()}</td>
                  <td className="px-4 py-3.5 tabular-nums">
                    <span className="inline-flex items-center rounded-md bg-secondary/80 px-2 py-0.5 text-xs font-mono text-muted-foreground">
                      {kw.rawDifficulty}/100
                    </span>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isHighPriority ? "bg-gradient-to-r from-emerald-400 to-teal-500" : "bg-gradient-to-r from-violet-500 to-cyan-400",
                          )}
                          style={{ width: `${Math.min(100, Math.max(10, score * 100))}%` }}
                        />
                      </div>
                      <span className={cn("font-bold text-xs font-mono", isHighPriority ? "text-emerald-400" : "text-foreground")}>
                        {kw.priorityScore !== null ? kw.priorityScore.toFixed(3) : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {kw.source === "demo_seed" ? <DataBadge kind="demo" /> : <span className="capitalize">{kw.source}</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="gradient"
                        className="h-8 text-xs gap-1"
                        disabled={pendingId === kw.id}
                        onClick={() => onGenerateBrief(kw.id)}
                      >
                        <FilePlus className="h-3.5 w-3.5" /> Brief
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs px-2"
                        disabled={pendingId === kw.id}
                        onClick={() => onDelete(kw.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing page <span className="font-semibold text-foreground">{result.page}</span> of{" "}
          <span className="font-semibold text-foreground">{totalPages}</span> ({result.total} terms)
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={result.page <= 1}
            onClick={() => updateParams({ page: result.page - 1 })}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={result.page >= totalPages}
            onClick={() => updateParams({ page: result.page + 1 })}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  activeSort,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortBy;
  activeSort: SortBy;
  sortDir: "asc" | "desc";
  onSort: (column: SortBy) => void;
}) {
  const isActive = activeSort === column;
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-1 font-semibold hover:text-foreground transition-colors"
      >
        <span>{label}</span>
        <ArrowUpDown
          className={cn(
            "h-3 w-3 transition-transform",
            isActive ? "text-primary opacity-100" : "opacity-40",
            isActive && sortDir === "desc" && "rotate-180",
          )}
        />
      </button>
    </th>
  );
}
