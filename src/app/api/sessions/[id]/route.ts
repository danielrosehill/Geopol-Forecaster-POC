import { NextResponse } from "next/server";
import { getSession, deleteSession } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = getSession(id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: row.id,
    createdAt: row.created_at,
    step: row.step,
    groundTruth: row.ground_truth ?? "",
    sitrep: row.sitrep ?? "",
    forecasts: row.forecasts ? JSON.parse(row.forecasts) : {},
    summary: row.summary ?? "",
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteSession(id);
  return NextResponse.json({ ok: true });
}
