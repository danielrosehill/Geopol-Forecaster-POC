import { generateText } from "ai";
import { openrouter, MODELS } from "@/lib/openrouter";
import { LENSES } from "@/lib/types";

export async function POST(request: Request) {
  const { forecasts } = await request.json();

  if (!forecasts || typeof forecasts !== "object") {
    return Response.json({ error: "forecasts are required" }, { status: 400 });
  }

  const forecastText = LENSES.map(
    (lens) => `=== ${lens.name.toUpperCase()} LENS ===\n${forecasts[lens.id] ?? "N/A"}`
  ).join("\n\n");

  const result = await generateText({
    model: openrouter(MODELS.grok),
    system: `You are a senior geopolitical analyst. You will receive six different forecast analyses of the Iran-Israel-US conflict, each from a different analytical lens (Neutral, Pessimistic, Optimistic, Blindsides, Probabilistic, Historical).

Produce an executive summary that:
- Identifies consensus themes across the lenses
- Highlights key divergences between perspectives
- Calls out the most critical risks and opportunities
- Provides a balanced overall assessment
- Notes the highest-confidence predictions (where multiple lenses agree)
- Flags the most important uncertainties

Keep it structured, concise, and actionable. Approximately 500-800 words.`,
    prompt: forecastText,
  });

  return Response.json({ summary: result.text });
}
