import { generateText } from "ai";
import { openrouter, MODELS } from "@/lib/openrouter";

export async function POST() {
  const systemPrompt = `You are a geopolitical intelligence analyst. Your task is to provide a detailed, neutral, factual account of the current situation regarding the Iran-Israel-US military conflict.

Structure your report with sections covering developments across these time windows: past 3 hours, past 6 hours, past 12 hours, and past 24 hours.

Rules:
- Be detailed but neutral — no predictions, no opinions
- Write for AI agent consumption (clear, structured, factual)
- All timestamps in UTC
- If you lack information for a time window, state that clearly
- Cover military actions, diplomatic developments, public statements, and regional reactions`;

  const [geminiResult, grokResult] = await Promise.all([
    generateText({
      model: openrouter(MODELS.gemini),
      system: systemPrompt,
      prompt: "Provide a comprehensive situational update on the Iran-Israel-US conflict. Cover the past 3h, 6h, 12h, and 24h windows.",
    }),
    generateText({
      model: openrouter(MODELS.grok),
      system: systemPrompt,
      prompt: "Provide a comprehensive situational update on the Iran-Israel-US conflict. Cover the past 3h, 6h, 12h, and 24h windows. Fill in any gaps with the most recent available information.",
    }),
  ]);

  const mergeResult = await generateText({
    model: openrouter(MODELS.grok),
    system: `You are a geopolitical intelligence editor. You will receive two situational reports about the Iran-Israel-US conflict from different sources. Merge them into a single, coherent, detailed Draft Ground Truth document.

Rules:
- Preserve all unique facts from both reports
- Resolve contradictions by noting both accounts
- Maintain the time-window structure (3h, 6h, 12h, 24h)
- Keep the tone neutral and factual — no predictions
- All timestamps in UTC
- Start with a brief overview paragraph, then the time-window sections`,
    prompt: `=== SOURCE 1 (Gemini) ===\n${geminiResult.text}\n\n=== SOURCE 2 (Grok) ===\n${grokResult.text}`,
  });

  return Response.json({ groundTruth: mergeResult.text });
}
