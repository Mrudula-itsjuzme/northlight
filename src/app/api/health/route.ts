import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "edge";

export async function GET() {
  const checks = {
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.app.env,
    executionMode: config.ai.executionMode,
    openAiConfigured: !!config.openai.apiKey,
    supabaseConfigured: !!config.supabase.url,
    databaseConfigured: !!config.supabase.databaseUrl,
  };

  return NextResponse.json(checks, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}