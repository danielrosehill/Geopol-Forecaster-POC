import { generateText } from "ai";
import { openrouter, MODELS } from "@/lib/openrouter";
import { LENSES, TIMEFRAMES } from "@/lib/types";
import { BASE_CONTEXT } from "@/lib/base-context";

const TIMEFRAME_LIST = TIMEFRAMES.map((tf) => `- **${tf.label}** (key: "${tf.id}")`).join("\n");

export async function POST(request: Request) {
  const { groundTruth } = await request.json();

  if (!groundTruth || typeof groundTruth !== "string") {
    return Response.json({ error: "groundTruth is required" }, { status: 400 });
  }

  const models = [MODELS.gemini, MODELS.grok];

  const results = await Promise.all(
    LENSES.map(async (lens, i) => {
      const model = models[i % models.length];
      const result = await generateText({
        model: openrouter(model),
        system: `You are a geopolitical forecasting analyst operating through the "${lens.name}" lens.

${lens.directive}

You will receive a confirmed ground truth document about the Iran-Israel-US conflict. Based on this, produce forecasts for each of the following timeframes:

${TIMEFRAME_LIST}

CRITICAL FORMATTING INSTRUCTIONS:
- You MUST separate each timeframe section with a line that reads exactly: <!-- TIMEFRAME: <key> -->
- For example: <!-- TIMEFRAME: 24h -->
- Place this marker BEFORE each section's content (including its heading).
- Each section should have a heading (## Timeframe Label) followed by your detailed analysis.
- Within each timeframe, state a clear, specific prediction for what will happen by that date. Be concrete — name actors, actions, and outcomes.
- Be detailed and substantive in each section.`,
        prompt: `=== CONFLICT BACKGROUND ===\n\n${BASE_CONTEXT}\n\n=== CONFIRMED GROUND TRUTH ===\n\n${groundTruth}`,
      });

      // Parse into per-timeframe sections
      const raw = result.text;
      const sections: Record<string, string> = {};
      const markerRegex = /<!--\s*TIMEFRAME:\s*(\S+)\s*-->/g;
      const markers: { id: string; index: number }[] = [];
      let match;
      while ((match = markerRegex.exec(raw)) !== null) {
        markers.push({ id: match[1], index: match.index + match[0].length });
      }

      if (markers.length > 0) {
        for (let j = 0; j < markers.length; j++) {
          const start = markers[j].index;
          const end = j + 1 < markers.length ? markers[j + 1].index - markers[j + 1].id.length - 25 : raw.length;
          sections[markers[j].id] = raw.slice(start, end).trim();
        }
      } else {
        // Fallback: agent didn't follow marker format — store whole text as combined
        sections["_full"] = raw;
      }

      return [lens.id, { full: raw, timeframes: sections }] as const;
    })
  );

  const forecasts = Object.fromEntries(results);
  return Response.json({ forecasts });
}
