/**
 * Zod schemas for structured AI outputs.
 * Used with AI SDK's Output.object() to get typed, validated data
 * instead of free-form markdown from LLMs.
 */
import { z } from "zod";

// ─── Forecast Schemas ───

export const PredictionSchema = z.object({
  prediction: z.string().describe("A specific, concrete prediction. Name actors, actions, and outcomes."),
  probability: z.string().describe("Probability estimate, e.g. '60-70%', 'High', '0.45 ± 0.12'"),
  confidence: z.enum(["High", "Medium", "Low"]).describe("Confidence in this prediction"),
  reasoning: z.string().describe("2-3 sentence explanation of why this outcome is expected"),
});

export const TimeframeForecastSchema = z.object({
  overview: z.string().describe("1-2 sentence overview of the most likely trajectory in this timeframe"),
  predictions: z.array(PredictionSchema).min(2).max(6).describe("Specific predictions for this timeframe"),
  keyRisks: z.array(z.string()).min(1).max(4).describe("Most critical risks or uncertainties"),
  indicators: z.array(z.string()).min(1).max(3).describe("Observable indicators to watch that would confirm or disconfirm these predictions"),
});

export const LensForecastSchema = z.object({
  lensAssessment: z.string().describe("1-2 sentence overall assessment from this analytical lens"),
  timeframes: z.object({
    "24h": TimeframeForecastSchema.describe("Next 24 hours forecast"),
    "1w": TimeframeForecastSchema.describe("Next 1 week forecast"),
    "1m": TimeframeForecastSchema.describe("Next 1 month forecast"),
    "1y": TimeframeForecastSchema.describe("Next 1 year forecast"),
  }),
});

export type StructuredPrediction = z.infer<typeof PredictionSchema>;
export type StructuredTimeframeForecast = z.infer<typeof TimeframeForecastSchema>;
export type StructuredLensForecast = z.infer<typeof LensForecastSchema>;

// ─── Summary Schema ───

export const CrossLensComparisonSchema = z.object({
  topic: z.string().describe("The topic or question where lenses diverge"),
  positions: z.array(z.object({
    lens: z.string().describe("Lens name"),
    position: z.string().describe("What this lens predicts on this topic"),
  })).min(2).max(6),
});

export const HighConfidencePredictionSchema = z.object({
  prediction: z.string().describe("The prediction text"),
  agreementCount: z.string().describe("How many lenses agree, e.g. '5/6 lenses'"),
  confidence: z.enum(["Very High", "High", "Medium"]),
});

export const SummarySchema = z.object({
  overallAssessment: z.string().describe("3-5 sentence overall assessment synthesizing all six lenses"),
  consensusThemes: z.array(z.string()).min(2).max(5).describe("Key themes where most lenses agree"),
  highConfidencePredictions: z.array(HighConfidencePredictionSchema).min(2).max(6).describe("Predictions with multi-lens agreement"),
  keyDivergences: z.array(CrossLensComparisonSchema).min(1).max(4).describe("Topics where lenses significantly disagree"),
  criticalUncertainties: z.array(z.string()).min(2).max(5).describe("Most important unknowns that could change the trajectory"),
  actionableInsights: z.array(z.string()).min(2).max(4).describe("Concrete takeaways for decision-makers"),
});

export type StructuredSummary = z.infer<typeof SummarySchema>;
