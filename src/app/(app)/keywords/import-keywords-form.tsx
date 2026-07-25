"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importKeywordsCsv, type ImportKeywordsCsvResult } from "@/lib/keywords/actions";
import type { CsvRowError } from "@/lib/csv/parse-products";
import { ErrorState } from "@/components/ui/error-state";
import { UploadCloud, Sparkles, CheckCircle2 } from "lucide-react";

export function ImportKeywordsForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportKeywordsCsvResult | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const text = await file.text();
      const response = await importKeywordsCsv(brandId, text);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.data);
      router.refresh();
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} />}

      <div
        onClick={() => !pending && inputRef.current?.click()}
        className="group relative flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center cursor-pointer transition-all duration-300 hover:border-primary/50 hover:bg-card/60"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          disabled={pending}
          className="hidden"
        />

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 shadow-glow-sm transition-transform duration-300 group-hover:scale-110">
          {pending ? <Sparkles className="h-5 w-5 animate-spin text-cyan-400" /> : <UploadCloud className="h-5 w-5" />}
        </div>

        <div className="mt-3 space-y-0.5">
          <p className="text-xs font-semibold text-foreground">
            {pending ? "Parsing & Normalizing CSV..." : "Click to upload CSV spreadsheet"}
          </p>
          <p className="text-[11px] text-muted-foreground">Supported format: CSV (max 500 terms per batch)</p>
        </div>
      </div>

      {result && (
        <div className="text-xs space-y-2">
          <p className="text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> Successfully imported {result.imported} of {result.totalRows} terms.
          </p>
          {result.rowErrors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">
              <p className="font-semibold">{result.rowErrors.length} row(s) had errors:</p>
              <ul className="list-inside list-disc text-xs">
                {result.rowErrors.map((e: CsvRowError, i: number) => (
                  <li key={i}>
                    Row {e.row}: {e.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
