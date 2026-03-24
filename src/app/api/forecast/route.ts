import { generateText } from "ai";
import { openrouter, MODELS } from "@/lib/openrouter";
import { LENSES } from "@/lib/types";

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

You will receive a confirmed ground truth document about the Iran-Israel-US conflict. Based on this, produce forecasts across four timeframes:

1. **Next 24 Hours** — immediate developments
2. **Next 1 Week** — short-term trajectory
3. **Next 1 Month** — medium-term evolution
4. **Next 1 Year** — long-term outlook

For each timeframe, provide structured analysis with specific scenarios. Be detailed and substantive.`,
        prompt: `=== CONFIRMED GROUND TRUTH ===\n\n${groundTruth}`,
      });
      return [lens.id, result.text] as const;
    })
  );

  const forecasts = Object.fromEntries(results);
  return Response.json({ forecasts });
}
