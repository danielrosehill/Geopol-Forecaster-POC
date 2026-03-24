/**
 * Run the full Geopol Forecaster pipeline from the CLI, skipping review stages.
 * Saves all outputs (ground truth, SITREP, forecasts, summary, PDF) to reports/<timestamp>/
 *
 * Usage: npx tsx scripts/run-pipeline.ts
 *
 * Requires: OPENROUTER_API_KEY and GEMINI_API_KEY in .env.local or environment
 */
import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { GoogleGenAI } from "@google/genai";
import { buildTypstSource } from "../src/lib/typst-template";
import { LENSES } from "../src/lib/types";
import { LensForecastSchema, SummarySchema } from "../src/lib/schemas";
import type { StructuredLensForecast } from "../src/lib/schemas";
import { BASE_CONTEXT } from "../src/lib/base-context";
import { fetchAllNews } from "../src/lib/rss";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// ─── Load .env.local ───
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Setup ───
const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const MODELS = {
  gemini: "google/gemini-3.1-flash-lite-preview",
  grok: "x-ai/grok-4.1-fast",
} as const;

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

if (!process.env.OPENROUTER_API_KEY || !process.env.GEMINI_API_KEY) {
  console.error("ERROR: OPENROUTER_API_KEY and GEMINI_API_KEY are required.");
  console.error("Set them in .env.local or as environment variables.");
  process.exit(1);
}

const sessionId = randomUUID();
const createdAt = new Date().toISOString();
const ts = createdAt.slice(0, 16).replace(/[T:]/g, "-");
const outDir = join(__dirname, "..", "reports", ts);
mkdirSync(outDir, { recursive: true });

async function main() {
const startTime = Date.now();

function log(msg: string) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${msg}`);
}

// ─── Stage 0: News Ingestion ───
log("Stage 0: Fetching live news feeds (RSS + ISW/CTP)...");

const news = await fetchAllNews(48);
log(`  RSS: ${news.articles.length} conflict-relevant headlines`);
log(`  ISW: ${news.iswReports.length} expert analysis report(s)`);

writeFileSync(join(outDir, "00-news-headlines.md"), news.brief, "utf-8");
writeFileSync(join(outDir, "00-isw-analysis.md"), news.iswBrief, "utf-8");

// ─── Stage 1: Intelligence Gathering ───
log("Stage 1/6: Gathering intelligence (Gemini search + Grok + news feeds)...");

const gatherSystem = `You are a geopolitical intelligence analyst. Your task is to provide a detailed, neutral, factual account of the current situation regarding the Iran-Israel-US military conflict.

Structure your report with sections covering developments across these time windows: past 3 hours, past 6 hours, past 12 hours, and past 24 hours.

Rules:
- Be detailed but neutral — no predictions, no opinions
- Write for AI agent consumption (clear, structured, factual)
- All timestamps in UTC
- If you lack information for a time window, state that clearly
- Cover military actions, diplomatic developments, public statements, and regional reactions
- PRIORITIZE the news articles and ISW analysis provided — these are timestamped, sourced reports`;

const [geminiResult, grokResult] = await Promise.all([
  (async () => {
    const response = await genai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [
        { role: "user" as const, parts: [{ text: gatherSystem }] },
        { role: "model" as const, parts: [{ text: "Understood. I will follow these instructions." }] },
        { role: "user" as const, parts: [{ text: "Provide a comprehensive situational update on the Iran-Israel-US conflict. Cover the past 3h, 6h, 12h, and 24h windows." }] },
      ],
      config: { tools: [{ googleSearch: {} }] },
    });
    return response.text ?? "";
  })(),
  generateText({
    model: openrouter(MODELS.grok),
    system: gatherSystem,
    prompt: "Provide a comprehensive situational update on the Iran-Israel-US conflict. Cover the past 3h, 6h, 12h, and 24h windows. Fill in any gaps with the most recent available information.",
  }),
]);

// Build the news context for the merge agent (ISW full text is most valuable)
const newsContext = [news.brief, "", news.iswBrief.slice(0, 30_000)].join("\n");

const mergeResult = await generateText({
  model: openrouter(MODELS.grok),
  system: `You are a geopolitical intelligence editor. You will receive THREE intelligence inputs about the Iran-Israel-US conflict:
1. Feed A: Gemini with Google Search grounding (live web data)
2. Feed B: Grok with real-time X/social media access
3. Feed C: Timestamped news articles from Israeli media (Times of Israel, Jerusalem Post) and ISW/CTP expert military analysis

Produce a single, clean, consolidated Ground Truth report.

CRITICAL RULES:
- PRIORITIZE Feed C (news articles + ISW) for specific facts, timestamps, and quotes — these are sourced journalism and expert analysis
- Use Feeds A and B to fill gaps and provide broader context
- Do NOT mention sources, feeds, or that multiple inputs were used
- Write as a single authoritative intelligence document
- Start with: "**GROUND TRUTH: IRAN-ISRAEL-US CONFLICT**"
- Follow with report date/time in UTC
- Executive overview paragraph (3-5 sentences)
- Time-window sections: Past 3 Hours, Past 6 Hours, Past 12 Hours, Past 24 Hours
- Within each section: Military Actions, Diplomatic Developments, Public Statements, Regional Reactions
- If feeds conflict, prefer the source with a specific timestamp or attribution
- All timestamps in UTC
- Neutral, factual tone — no predictions`,
  prompt: `=== FEED A (Gemini/Search) ===\n${geminiResult}\n\n=== FEED B (Grok/X) ===\n${grokResult.text}\n\n=== FEED C (News Articles + ISW Expert Analysis) ===\n${newsContext}`,
});

const groundTruth = mergeResult.text;
writeFileSync(join(outDir, "01-ground-truth.md"), groundTruth, "utf-8");
log(`Ground truth saved (${groundTruth.length} chars)`);

// ─── Stage 2: SITREP Generation ───
log("Stage 2/6: Generating SITREP...");

const sitrepResult = await generateText({
  model: openrouter(MODELS.gemini),
  system: `You are an intelligence analyst writing a formal, precise situation report (SITREP) on the Iran-Israel-US military conflict. Model your writing on ISW/Critical Threats Project reports.

SOURCING AND ATTRIBUTION (MANDATORY):
Every factual claim MUST be attributed.

CONFIDENCE LEVELS:
Use standardized probability language: Almost Certain (95-99%) / Very Likely (80-95%) / Likely (55-80%) / Roughly Even Chance (45-55%) / Unlikely (20-45%) / Very Unlikely (5-20%)

Transform the ground truth into a structured SITREP. Output valid JSON with these exact keys:
{
  "key_takeaways": "...", "coalition_ops": "...", "iranian_ops": "...", "strikes": "...",
  "northern_front": "...", "gulf_states": "...", "military_technical": "...", "trajectory": "...",
  "us_statements": "...", "israel_statements": "...", "home_front": "...", "world_reaction": "...",
  "osint_indicators": "...", "outlook": "..."
}

Rules:
- Every section must have content
- Use precise military and geopolitical terminology
- All timestamps in UTC`,
  prompt: `Transform the following into a structured SITREP. Return ONLY valid JSON, no markdown fences.\n\n${BASE_CONTEXT}\n\n=== CURRENT SITUATION UPDATE ===\n\n${groundTruth}`,
});

let sitrep: Record<string, string>;
try {
  const cleaned = sitrepResult.text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
  sitrep = JSON.parse(cleaned);
} catch {
  sitrep = { key_takeaways: sitrepResult.text };
}

writeFileSync(join(outDir, "02-sitrep.json"), JSON.stringify(sitrep, null, 2), "utf-8");
log(`SITREP saved (${Object.keys(sitrep).length} sections)`);

// ─── Stage 3: Scenario Forecasting (Structured Output) ───
log("Stage 3/6: Running 6 forecast agents in parallel (structured output)...");

const models = [MODELS.gemini, MODELS.grok];

const forecastResults = await Promise.all(
  LENSES.map(async (lens, i) => {
    const model = models[i % models.length];
    const result = await generateText({
      model: openrouter(model),
      output: Output.object({ schema: LensForecastSchema }),
      system: `You are a geopolitical forecasting analyst operating through the "${lens.name}" lens.

${lens.directive}

You will receive a confirmed ground truth document about the Iran-Israel-US conflict. Produce forecasts for four timeframes: Next 24 Hours, Next 1 Week, Next 1 Month, Next 1 Year.

For each timeframe, provide:
- An overview of the most likely trajectory
- 2-6 specific, concrete predictions with probability estimates and confidence levels
- Key risks or uncertainties
- Observable indicators to watch

Be concrete — name actors, actions, and outcomes. Assign explicit probabilities where possible.`,
      prompt: `=== CONFLICT BACKGROUND ===\n\n${BASE_CONTEXT}\n\n=== CONFIRMED GROUND TRUTH ===\n\n${groundTruth}`,
    });

    log(`  ${lens.name} lens complete (${model.split("/")[1]})`);
    return [lens.id, result.output] as const;
  })
);

const forecasts: Record<string, StructuredLensForecast> = Object.fromEntries(forecastResults);
writeFileSync(join(outDir, "03-forecasts.json"), JSON.stringify(forecasts, null, 2), "utf-8");
log("All 6 forecasts saved (structured)");

// ─── Stage 4: Executive Summary (Structured Output) ───
log("Stage 4/6: Generating executive summary (structured output)...");

// Build text representation for the summary agent
const forecastText = LENSES.map((lens) => {
  const f = forecasts[lens.id];
  if (!f) return `=== ${lens.name.toUpperCase()} LENS ===\nNo forecast.`;
  const lines = [`=== ${lens.name.toUpperCase()} LENS ===`, f.lensAssessment];
  for (const [tfId, tf] of Object.entries(f.timeframes)) {
    lines.push(`--- ${tfId} ---`, tf.overview);
    for (const p of tf.predictions) {
      lines.push(`- ${p.prediction} (${p.probability}, ${p.confidence}): ${p.reasoning}`);
    }
    lines.push(`Risks: ${tf.keyRisks.join("; ")}`);
  }
  return lines.join("\n");
}).join("\n\n");

const summaryResult = await generateText({
  model: openrouter(MODELS.grok),
  output: Output.object({ schema: SummarySchema }),
  system: `You are a senior geopolitical analyst. You will receive six structured forecast analyses of the Iran-Israel-US conflict, each from a different analytical lens (Neutral, Pessimistic, Optimistic, Blindsides, Probabilistic, Historical).

Produce a structured executive summary that:
- Provides an overall assessment synthesizing all perspectives
- Identifies consensus themes (where most lenses agree)
- Lists high-confidence predictions with lens agreement counts
- Highlights key divergences between lenses
- Flags critical uncertainties
- Provides actionable insights for decision-makers

Be precise and analytical. Reference specific lenses by name.`,
  prompt: forecastText,
});

const summary = summaryResult.output;
writeFileSync(join(outDir, "04-summary.json"), JSON.stringify(summary, null, 2), "utf-8");
log(`Summary saved (structured, ${Object.keys(summary!).length} sections)`);

// ─── Stage 5: PDF Generation ───
log("Stage 5/6: Generating PDF report...");

const typstSource = buildTypstSource({
  sessionId,
  createdAt,
  groundTruth,
  sitrep,
  forecasts,
  summary,
});

const typPath = join(outDir, "report.typ");
const pdfPath = join(outDir, "report.pdf");
writeFileSync(typPath, typstSource, "utf-8");

try {
  execFileSync("typst", ["compile", typPath, pdfPath], { stdio: "pipe", timeout: 30_000 });
  log(`PDF generated: ${pdfPath}`);
} catch (err: unknown) {
  const e = err as { stderr?: Buffer };
  console.error("Typst compilation failed:");
  console.error(e.stderr?.toString() ?? err);
  // Keep the .typ for debugging
}

// ─── Summary ───
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n${"=".repeat(60)}`);
console.log(`Pipeline complete in ${elapsed}s`);
console.log(`Session: ${sessionId.slice(0, 8)}`);
console.log(`Output:  ${outDir}/`);
console.log(`Files:`);
console.log(`  00-news-headlines.md RSS headlines (Times of Israel, JPost)`);
console.log(`  00-isw-analysis.md   ISW/CTP expert analysis (full text)`);
console.log(`  01-ground-truth.md   Consolidated ground truth (3 sources)`);
console.log(`  02-sitrep.json       Structured SITREP (14 sections)`);
console.log(`  03-forecasts.json    6 lens forecasts with timeframes`);
console.log(`  04-summary.json      Executive summary (structured)`);
console.log(`  report.typ           Typst source`);
console.log(`  report.pdf           Final PDF report`);
console.log(`${"=".repeat(60)}`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
