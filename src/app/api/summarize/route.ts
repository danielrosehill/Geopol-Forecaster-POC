import { generateText, Output } from "ai";
import { openrouter, MODELS } from "@/lib/openrouter";
import { LENSES } from "@/lib/types";
import { SummarySchema, type StructuredLensForecast } from "@/lib/schemas";

export async function POST(request: Request) {
  const { forecasts } = await request.json();

  if (!forecasts || typeof forecasts !== "object") {
    return Response.json({ error: "forecasts are required" }, { status: 400 });
  }

  // Build a text representation of all forecasts for the summary agent
  const forecastText = LENSES.map((lens) => {
    const f = forecasts[lens.id] as StructuredLensForecast | string | { full: string } | undefined;
    if (!f) return `=== ${lens.name.toUpperCase()} LENS ===\nNo forecast available.`;

    // Handle structured format
    if (typeof f === "object" && "lensAssessment" in f) {
      const structured = f as StructuredLensForecast;
      const lines = [`=== ${lens.name.toUpperCase()} LENS ===`, structured.lensAssessment, ""];
      for (const [tfId, tf] of Object.entries(structured.timeframes)) {
        lines.push(`--- ${tfId} ---`, tf.overview);
        for (const p of tf.predictions) {
          lines.push(`- ${p.prediction} (${p.probability}, ${p.confidence} confidence): ${p.reasoning}`);
        }
        lines.push(`Risks: ${tf.keyRisks.join("; ")}`, "");
      }
      return lines.join("\n");
    }

    // Handle old string or {full} format
    const text = typeof f === "string" ? f : (f as { full: string }).full ?? "N/A";
    return `=== ${lens.name.toUpperCase()} LENS ===\n${text}`;
  }).join("\n\n");

  const result = await generateText({
    model: openrouter(MODELS.grok),
    output: Output.object({ schema: SummarySchema }),
    system: `You are a senior geopolitical analyst. You will receive six different forecast analyses of the Iran-Israel-US conflict, each from a different analytical lens (Neutral, Pessimistic, Optimistic, Blindsides, Probabilistic, Historical).

Produce a structured executive summary that:
- Provides an overall assessment synthesizing all perspectives
- Identifies consensus themes (where most lenses agree)
- Lists high-confidence predictions with lens agreement counts
- Highlights key divergences between lenses
- Flags critical uncertainties
- Provides actionable insights for decision-makers

Be precise and analytical. Reference specific lenses by name when noting agreement or divergence.`,
    prompt: forecastText,
  });

  return Response.json({ summary: result.output });
}
