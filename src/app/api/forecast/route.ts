import { generateText, Output } from "ai";
import { openrouter, MODELS } from "@/lib/openrouter";
import { LENSES } from "@/lib/types";
import { LensForecastSchema } from "@/lib/schemas";
import { BASE_CONTEXT } from "@/lib/base-context";

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
        output: Output.object({ schema: LensForecastSchema }),
        system: `You are a geopolitical forecasting analyst operating through the "${lens.name}" lens.

${lens.directive}

You will receive a confirmed ground truth document about the Iran-Israel-US conflict. Based on this, produce forecasts for four timeframes: Next 24 Hours, Next 1 Week, Next 1 Month, Next 1 Year.

For each timeframe, provide:
- An overview of the most likely trajectory
- 2-6 specific, concrete predictions with probability estimates and confidence levels
- Key risks or uncertainties
- Observable indicators to watch

Be concrete — name actors, actions, and outcomes. Assign explicit probabilities where possible.`,
        prompt: `=== CONFLICT BACKGROUND ===\n\n${BASE_CONTEXT}\n\n=== CONFIRMED GROUND TRUTH ===\n\n${groundTruth}`,
      });

      return [lens.id, result.output] as const;
    })
  );

  const forecasts = Object.fromEntries(results);
  return Response.json({ forecasts });
}
