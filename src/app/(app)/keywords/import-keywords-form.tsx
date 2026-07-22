"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importKeywordsCsv, type ImportKeywordsCsvResult } from "@/lib/keywords/actions";
import type { CsvRowError } from "@/lib/csv/parse-products";
import { ErrorState } from "@/components/ui/error-state";

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
    <div className="space-y-2">
      {error && <ErrorState message={error} />}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFileChange}
        disabled={pending}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {result && (
        <div className="text-sm">
          <p className="text-success-foreground">
            Imported {result.imported} of {result.totalRows} rows.
          </p>
          {result.rowErrors.length > 0 && (
            <div className="mt-2 space-y-1 rounded-md bg-destructive/10 p-2 text-destructive">
              <p className="font-medium">{result.rowErrors.length} row(s) had errors:</p>
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
