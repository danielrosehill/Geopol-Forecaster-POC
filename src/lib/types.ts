export interface Session {
  id: string;
  createdAt: string;
  groundTruth: string | null;
  confirmedGroundTruth: string | null;
  sitrep: string | null;
  forecasts: Record<string, string>;
  summary: string | null;
}

export const SITREP_SECTIONS = [
  "key_takeaways",
  "coalition_ops",
  "iranian_ops",
  "strikes",
  "northern_front",
  "gulf_states",
  "military_technical",
  "trajectory",
  "us_statements",
  "israel_statements",
  "home_front",
  "world_reaction",
  "osint_indicators",
  "outlook",
] as const;

export type SitrepSectionId = (typeof SITREP_SECTIONS)[number];

export const LENSES = [
  { id: "neutral", name: "Neutral", directive: "Provide your honest, unbiased assessment of how this conflict will evolve. Do not lean optimistic or pessimistic." },
  { id: "pessimistic", name: "Pessimistic", directive: "Model the worst-case scenarios. Focus on escalation paths, failed diplomacy, and dangerous miscalculations." },
  { id: "optimistic", name: "Optimistic", directive: "Model the best-case scenarios. Focus on de-escalation paths, diplomatic breakthroughs, and restraint by actors." },
  { id: "blindsides", name: "Blindsides", directive: "Identify low-probability but conceivable pivots and black swan events that could fundamentally change the trajectory." },
  { id: "probabilistic", name: "Probabilistic", directive: "Use probabilities and historical precedent to make mathematically rigorous predictions. Assign explicit probability ranges to outcomes." },
  { id: "historical", name: "Historical", directive: "Make predictions solely through the lens of historical actor behaviour in similar circumstances. Deliberately ignore statistical weight of evidence to produce a differentiated, historically-grounded response." },
] as const;

export type LensId = (typeof LENSES)[number]["id"];

export const TIMEFRAMES = [
  { id: "24h", label: "Next 24 Hours", short: "24h" },
  { id: "1w", label: "Next 1 Week", short: "1 Week" },
  { id: "1m", label: "Next 1 Month", short: "1 Month" },
  { id: "1y", label: "Next 1 Year", short: "1 Year" },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

/** Structured forecast output from each lens agent */
export interface LensForecast {
  full: string;
  timeframes: Record<string, string>;
}
