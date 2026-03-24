import { NextResponse } from "next/server";
import { listSessions, upsertSession } from "@/lib/db";

export async function GET() {
  const rows = listSessions();
  const sessions = rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    step: r.step,
    groundTruth: r.ground_truth ?? "",
    sitrep: r.sitrep ?? "",
    forecasts: r.forecasts ? JSON.parse(r.forecasts) : {},
    summary: r.summary ?? "",
  }));
  return NextResponse.json(sessions);
}

export async function PUT(req: Request) {
  const body = await req.json();
  upsertSession({
    id: body.id,
    createdAt: body.createdAt,
    step: body.step,
    groundTruth: body.groundTruth ?? null,
    sitrep: body.sitrep ?? null,
    forecasts: body.forecasts ?? null,
    summary: body.summary ?? null,
  });
  return NextResponse.json({ ok: true });
}
