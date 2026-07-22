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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form onSubmit={onSearchSubmit} className="flex gap-2">
          <Input
            placeholder="Search keywords..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCluster} disabled={bulkPending}>
            Generate clusters
          </Button>
          <Button variant="outline" size="sm" onClick={onRescore} disabled={bulkPending}>
            Rescore all
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <SortableHeader label="Term" column="term" activeSort={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortableHeader label="Volume" column="rawVolume" activeSort={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortableHeader
                label="Difficulty"
                column="rawDifficulty"
                activeSort={sortBy}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableHeader
                label="Priority"
                column="priorityScore"
                activeSort={sortBy}
                sortDir={sortDir}
                onSort={onSort}
              />
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No keywords yet.
                </td>
              </tr>
            )}
            {result.items.map((kw) => (
              <tr key={kw.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{kw.term}</td>
                <td className="px-3 py-2 tabular-nums">{kw.rawVolume.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums">{kw.rawDifficulty}</td>
                <td className="px-3 py-2 tabular-nums">
                  {kw.priorityScore !== null ? kw.priorityScore.toFixed(3) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {kw.source === "demo_seed" ? <DataBadge kind="demo" /> : kw.source}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendingId === kw.id}
                      onClick={() => onGenerateBrief(kw.id)}
                    >
                      Generate brief
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pendingId === kw.id}
                      onClick={() => onDelete(kw.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {result.page} of {totalPages} ({result.total} total)
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={result.page <= 1}
            onClick={() => updateParams({ page: result.page - 1 })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={result.page >= totalPages}
            onClick={() => updateParams({ page: result.page + 1 })}
          >
            Next
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
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        {isActive && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
