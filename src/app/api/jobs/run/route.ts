import { NextRequest, NextResponse } from "next/server";
import { runWorkerOnce } from "@/lib/jobs/worker";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${config.jobs.workerSecret}`;

  if (!config.jobs.workerSecret || authHeader !== expected) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const processed = await runWorkerOnce(config.jobs.maxJobsPerRun);
    return NextResponse.json({ processed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}