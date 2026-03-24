import { LENSES, TIMEFRAMES } from "./types";
import type { StructuredLensForecast, StructuredSummary } from "./schemas";

/**
 * Convert markdown text to Typst markup.
 * Handles: headings, bold, italic, bullet lists, numbered lists, links, inline code, blockquotes.
 * Falls through to plain text for anything unrecognized.
 */
function markdownToTypst(md: string): string {
  const lines = md.split("\n");
  const output: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Markdown tables: detect header row | col | col |
    if (/^\|(.+\|)+\s*$/.test(line)) {
      const tableLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && /^\|(.+\|)+\s*$/.test(lines[j])) {
        tableLines.push(lines[j]);
        j++;
      }
      i = j - 1;

      const parseRow = (row: string) =>
        row.split("|").slice(1, -1).map((c) => c.trim());

      const headers = parseRow(tableLines[0]);
      const dataRows = tableLines
        .slice(2)
        .filter((r) => !/^[|\s:-]+$/.test(r))
        .map(parseRow);

      const cols = headers.length;
      const allCells = [
        ...headers.map((h) => `  [*${convertInline(h)}*]`),
        ...dataRows.flatMap((row) =>
          row.map((cell) => `  [${convertInline(cell)}]`)
        ),
      ];

      output.push(`#table(`);
      output.push(`  columns: (${Array(cols).fill("1fr").join(", ")}),`);
      output.push(`  stroke: 0.5pt + rgb("#ccc"),`);
      output.push(`  inset: 6pt,`);
      output.push(allCells.join(",\n") + ",");
      output.push(`)`);
      continue;
    }

    // Headings: ## Title → === Title
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      if (inList) { inList = false; }
      const level = headingMatch[1].length;
      const typstLevel = "=".repeat(Math.min(level + 1, 5));
      output.push(`${typstLevel} ${convertInline(headingMatch[2])}`);
      continue;
    }

    // Horizontal rules
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      output.push("#line(length: 100%, stroke: 0.5pt + rgb(\"#ccc\"))");
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      const quoteText = line.replace(/^>\s*/, "");
      output.push(`#block(inset: (left: 1em), stroke: (left: 2pt + rgb("#999")))[${convertInline(quoteText)}]`);
      continue;
    }

    // Bullet lists: - item or * item
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      inList = true;
      const indent = bulletMatch[1].length > 0 ? "  " : "";
      output.push(`${indent}- ${convertInline(bulletMatch[2])}`);
      continue;
    }

    // Numbered lists: 1. item
    const numMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (numMatch) {
      inList = true;
      const indent = numMatch[1].length > 0 ? "  " : "";
      output.push(`${indent}+ ${convertInline(numMatch[2])}`);
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      if (inList) inList = false;
      output.push("");
      continue;
    }

    // Regular paragraph text
    output.push(convertInline(line));
  }

  return sanitizeTypst(output.join("\n"));
}

/**
 * Sanitize Typst output to ensure all delimiters are balanced.
 * LLM output can have truncated or malformed markdown that leaves
 * unclosed * or _ delimiters after conversion.
 */
function sanitizeTypst(text: string): string {
  return text.split("\n").map((line) => {
    // Skip Typst directives
    if (line.trimStart().startsWith("#")) return line;
    // Skip list item markers at start, then check the rest
    const stripped = line.replace(/^\s*[-+]\s*/, "");
    if (stripped.startsWith("#")) return line;

    // Count all unescaped * and _ on this line
    const stars = (line.match(/(?<!\\)\*/g) || []).length;
    const underscores = (line.match(/(?<!\\)_/g) || []).length;

    // If odd count, close the last one
    if (stars % 2 !== 0) line += "*";
    if (underscores % 2 !== 0) line += "_";

    return line;
  }).join("\n");
}

/**
 * Convert inline markdown formatting to Typst.
 */
function convertInline(text: string): string {
  const codeSegments: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSegments.length;
    codeSegments.push(`#raw("${code.replace(/"/g, '\\"')}")`);
    return `%%CODE${idx}%%`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    return `#link("${url}")[${escapeTypstChars(linkText)}]`;
  });

  text = text.replace(/\*{3}([^*]+)\*{3}/g, (_, t) => `*_${escapeTypstChars(t)}_*`);
  text = text.replace(/_{3}([^_]+)_{3}/g, (_, t) => `*_${escapeTypstChars(t)}_*`);
  text = text.replace(/\*{2}([^*]+)\*{2}/g, (_, t) => `*${escapeTypstChars(t)}*`);
  text = text.replace(/_{2}([^_]+)_{2}/g, (_, t) => `*${escapeTypstChars(t)}*`);
  text = text.replace(/\*([^*]+)\*/g, (_, t) => `_${escapeTypstChars(t)}_`);
  text = text.replace(/(?<![a-zA-Z])_([^_]+)_(?![a-zA-Z])/g, (_, t) => `_${escapeTypstChars(t)}_`);

  text = escapeRemainingTypst(text);

  for (let i = 0; i < codeSegments.length; i++) {
    text = text.replace(`%%CODE${i}%%`, codeSegments[i]);
  }

  return text;
}

function escapeTypstChars(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>");
}

function escapeRemainingTypst(text: string): string {
  return text
    .replace(/(?<!\\)#(?![a-z])/g, "\\#")
    .replace(/(?<!\\)\$/g, "\\$")
    .replace(/(?<!\\)@/g, "\\@");
}

/** Map of which model powers each lens (mirrors forecast/route.ts logic) */
const LENS_MODELS: Record<string, string> = (() => {
  const models = ["Gemini 3.1 Flash Lite", "Grok 4.1 Fast"];
  const map: Record<string, string> = {};
  LENSES.forEach((lens, i) => {
    map[lens.id] = models[i % models.length];
  });
  return map;
})();

const SITREP_SECTION_TITLES: Record<string, string> = {
  key_takeaways: "Key Takeaways",
  coalition_ops: "Coalition / US Operations",
  iranian_ops: "Iranian Offensive Operations",
  strikes: "Strike Activity & Battle Damage Assessment",
  northern_front: "Northern Front (Lebanon / Hizballah)",
  gulf_states: "Gulf States & Strait of Hormuz",
  military_technical: "Military & Technical Assessment",
  trajectory: "Strategic Trajectory & Escalation Indicators",
  us_statements: "US Official Statements",
  israel_statements: "Israeli Official Statements",
  home_front: "Israeli Home Front",
  world_reaction: "International Reaction",
  osint_indicators: "OSINT Indicators",
  outlook: "12\\u{2013}24 Hour Outlook",
};

/** Shared Typst preamble: fonts, colors, page setup */
function typstPreamble(opts: {
  title: string;
  sessionId: string;
  timestamp: string;
  generatedAt: string;
}): string {
  return `
#set document(title: "${opts.title}", author: "Geopol Forecaster")
#set page(
  paper: "a4",
  margin: (top: 2.5cm, bottom: 2.5cm, left: 2cm, right: 2cm),
  header: context {
    if counter(page).get().first() > 1 {
      set text(font: "IBM Plex Sans", size: 8pt, fill: rgb("#888"))
      grid(
        columns: (1fr, 1fr),
        align(left)[Geopol Forecaster],
        align(right)[Session ${escapeTypstChars(opts.sessionId.slice(0, 8))}],
      )
    }
  },
  footer: context {
    let current = counter(page).get().first()
    let total = counter(page).final().first()
    set text(font: "IBM Plex Sans", size: 8pt, fill: rgb("#999"))
    grid(
      columns: (1fr, 1fr),
      align(left)[Generated: ${opts.generatedAt}],
      align(right)[Page #current of #total],
    )
  },
)
#set text(font: "IBM Plex Sans", size: 10.5pt)
#set heading(numbering: (..nums) => {
  let n = nums.pos()
  if n.len() <= 2 { numbering("1.1", ..nums) }
})
#set par(justify: true, leading: 0.65em)
#show raw: set text(font: "IBM Plex Mono", size: 9pt)

// Accent color
#let accent = rgb("#1a365d")
#let accent-light = rgb("#2b6cb0")
#let muted = rgb("#718096")
#let border = rgb("#e2e8f0")
`;
}

/**
 * Build a single-lens PDF with polished styling.
 */
export function buildLensTypstSource(params: {
  lensId: string;
  lensName: string;
  agentModel: string;
  content: string;
  sessionId: string;
  createdAt: string;
}): string {
  const timestamp = new Date(params.createdAt).toUTCString();
  const generatedAt = new Date().toUTCString();

  return `
${typstPreamble({ title: `${params.lensName} Forecast — Geopol Forecaster`, sessionId: params.sessionId, timestamp, generatedAt })}

// Title page
#v(3cm)

#align(center)[
  #text(size: 10pt, fill: muted, tracking: 0.15em, weight: "medium")[GEOPOL FORECASTER]
  #v(0.6cm)
  #line(length: 40%, stroke: 1pt + border)
  #v(0.6cm)
  #text(size: 24pt, weight: "bold", fill: accent)[${escapeTypstChars(params.lensName)} Forecast]
  #v(0.4cm)
  #text(size: 12pt, fill: muted)[Iran\\–Israel\\–US Conflict Assessment]
  #v(1cm)
  #block(
    width: 70%,
    inset: 16pt,
    radius: 4pt,
    stroke: 0.5pt + border,
    fill: rgb("#f7fafc"),
  )[
    #set text(size: 9.5pt)
    #grid(
      columns: (auto, 1fr),
      column-gutter: 12pt,
      row-gutter: 8pt,
      text(fill: muted)[Session],
      text(font: "IBM Plex Mono")[${escapeTypstChars(params.sessionId.slice(0, 8))}],
      text(fill: muted)[Analysis date],
      [${timestamp}],
      text(fill: muted)[Agent],
      [${escapeTypstChars(params.agentModel)}],
      text(fill: muted)[PDF generated],
      [${generatedAt}],
    )
  ]
]

#v(1cm)
#line(length: 60%, stroke: 0.5pt + border)
#align(center, text(size: 9pt, fill: muted)[This document contains a single analytical lens from a multi-perspective forecast session.])

#pagebreak()

// Content
= ${escapeTypstChars(params.lensName)} Lens Analysis

#text(size: 9pt, fill: muted)[_Agent: ${escapeTypstChars(params.agentModel)} (via OpenRouter)_]

#v(0.3cm)

${markdownToTypst(params.content)}

#v(1cm)
#line(length: 100%, stroke: 0.5pt + border)
#v(0.3cm)
#text(size: 8pt, fill: muted)[
  This forecast was generated as part of a multi-agent analysis session using the Geopol Forecaster system.
  Session ${escapeTypstChars(params.sessionId.slice(0, 8))} \\— ${timestamp}
]
`;
}

/** Old forecast data with optional timeframe breakdowns (markdown strings) */
interface LegacyForecastData {
  full: string;
  timeframes?: Record<string, string>;
}

/** Check if a forecast value is the new structured format */
function isStructuredForecast(val: unknown): val is StructuredLensForecast {
  return typeof val === "object" && val !== null && "lensAssessment" in val && "timeframes" in val;
}

/** Check if summary is the new structured format */
function isStructuredSummary(val: unknown): val is StructuredSummary {
  return typeof val === "object" && val !== null && "overallAssessment" in val && "consensusThemes" in val;
}

/** Render a structured forecast for one lens + one timeframe to Typst */
function renderStructuredTimeframe(tf: { overview: string; predictions: Array<{ prediction: string; probability: string; confidence: string; reasoning: string }>; keyRisks: string[]; indicators: string[] }): string {
  const lines: string[] = [];
  lines.push(escapeTypstChars(tf.overview));
  lines.push("");

  // Predictions table
  if (tf.predictions.length > 0) {
    lines.push(`#table(`);
    lines.push(`  columns: (2fr, auto, auto),`);
    lines.push(`  stroke: 0.5pt + border,`);
    lines.push(`  inset: 6pt,`);
    lines.push(`  [*Prediction*], [*Probability*], [*Confidence*],`);
    for (const p of tf.predictions) {
      lines.push(`  [${escapeTypstChars(p.prediction)}], [${escapeTypstChars(p.probability)}], [${escapeTypstChars(p.confidence)}],`);
    }
    lines.push(`)`);
    lines.push("");

    // Reasoning for each prediction
    for (const p of tf.predictions) {
      lines.push(`- *${escapeTypstChars(p.prediction)}*: ${escapeTypstChars(p.reasoning)}`);
    }
    lines.push("");
  }

  // Key risks
  if (tf.keyRisks.length > 0) {
    lines.push(`*Key Risks:*`);
    for (const r of tf.keyRisks) lines.push(`- ${escapeTypstChars(r)}`);
    lines.push("");
  }

  // Indicators to watch
  if (tf.indicators.length > 0) {
    lines.push(`*Indicators to Watch:*`);
    for (const ind of tf.indicators) lines.push(`- ${escapeTypstChars(ind)}`);
    lines.push("");
  }

  return lines.join("\n");
}

/** Render a structured summary to Typst */
function renderStructuredSummary(s: StructuredSummary): string {
  const lines: string[] = [];

  // Overall assessment
  lines.push(escapeTypstChars(s.overallAssessment));
  lines.push("");

  // Consensus themes
  lines.push(`== Consensus Themes`);
  for (const theme of s.consensusThemes) {
    lines.push(`+ ${escapeTypstChars(theme)}`);
  }
  lines.push("");

  // High confidence predictions
  lines.push(`== High-Confidence Predictions`);
  if (s.highConfidencePredictions.length > 0) {
    lines.push(`#table(`);
    lines.push(`  columns: (2fr, auto, auto),`);
    lines.push(`  stroke: 0.5pt + border,`);
    lines.push(`  inset: 6pt,`);
    lines.push(`  [*Prediction*], [*Agreement*], [*Confidence*],`);
    for (const p of s.highConfidencePredictions) {
      lines.push(`  [${escapeTypstChars(p.prediction)}], [${escapeTypstChars(p.agreementCount)}], [${escapeTypstChars(p.confidence)}],`);
    }
    lines.push(`)`);
  }
  lines.push("");

  // Key divergences
  lines.push(`== Key Divergences`);
  for (const d of s.keyDivergences) {
    lines.push(`*${escapeTypstChars(d.topic)}:*`);
    for (const pos of d.positions) {
      lines.push(`- _${escapeTypstChars(pos.lens)}_: ${escapeTypstChars(pos.position)}`);
    }
    lines.push("");
  }

  // Critical uncertainties
  lines.push(`== Critical Uncertainties`);
  for (const u of s.criticalUncertainties) {
    lines.push(`- ${escapeTypstChars(u)}`);
  }
  lines.push("");

  // Actionable insights
  lines.push(`== Actionable Insights`);
  for (const a of s.actionableInsights) {
    lines.push(`+ ${escapeTypstChars(a)}`);
  }

  return lines.join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTypstSource(params: {
  sessionId: string;
  createdAt: string;
  groundTruth: string;
  sitrep: Record<string, string> | null;
  forecasts: Record<string, unknown>;
  summary: unknown;
}): string {
  const timestamp = new Date(params.createdAt).toUTCString();
  const generatedAt = new Date().toUTCString();

  // Detect if forecasts are structured (new) or legacy (old)
  const firstForecast = Object.values(params.forecasts)[0];
  const useStructuredForecasts = isStructuredForecast(firstForecast);
  const useStructuredSummary = isStructuredSummary(params.summary);

  // For legacy compat: normalize to LegacyForecastData
  const legacyForecasts: Record<string, LegacyForecastData> = {};
  if (!useStructuredForecasts) {
    for (const [key, val] of Object.entries(params.forecasts)) {
      if (typeof val === "string") {
        legacyForecasts[key] = { full: val };
      } else {
        legacyForecasts[key] = val as LegacyForecastData;
      }
    }
  }

  const hasTimeframes = useStructuredForecasts || Object.values(legacyForecasts).some(
    (f) => f.timeframes && Object.keys(f.timeframes).length > 0 && !f.timeframes["_full"]
  );

  // Build SITREP sections
  let sitrepContent = "";
  if (params.sitrep && Object.keys(params.sitrep).length > 0) {
    const sections = Object.entries(SITREP_SECTION_TITLES)
      .map(([key, title]) => {
        const content = params.sitrep![key];
        if (!content) return "";
        return `
== ${title}

${markdownToTypst(content)}
`;
      })
      .filter(Boolean)
      .join("\n");

    sitrepContent = `
= Situation Report

#text(size: 9pt, fill: muted)[_Generated by: Gemini 3.1 Flash Lite (via OpenRouter)_]

${sections}
`;
  }

  // Build forecast sections organized by TIME HORIZON first
  let forecastByTimeframe = "";
  if (hasTimeframes) {
    const timeframeSections = TIMEFRAMES.map((tf) => {
      const lensSections = LENSES.map((lens) => {
        const model = LENS_MODELS[lens.id];
        const rawForecast = params.forecasts[lens.id];

        if (useStructuredForecasts && isStructuredForecast(rawForecast)) {
          const tfData = rawForecast.timeframes[tf.id as keyof typeof rawForecast.timeframes];
          if (!tfData) return "";
          return `
=== ${escapeTypstChars(lens.name)} Lens
#text(size: 8.5pt, fill: muted)[_${model}_]

${renderStructuredTimeframe(tfData)}
`;
        } else {
          const legacy = legacyForecasts[lens.id];
          const content = legacy?.timeframes?.[tf.id];
          if (!content) return "";
          return `
=== ${escapeTypstChars(lens.name)} Lens
#text(size: 8.5pt, fill: muted)[_${model}_]

${markdownToTypst(content)}
`;
        }
      }).filter(Boolean).join("\n");

      if (!lensSections) return "";
      return `
== ${escapeTypstChars(tf.label)}

${lensSections}
`;
    }).filter(Boolean).join("\n");

    forecastByTimeframe = `
= Scenario Forecasts by Time Horizon

#text(size: 9pt, fill: muted)[_Each timeframe shows all six analytical lenses for easy cross-comparison._]

#v(0.3cm)

${timeframeSections}
`;
  }

  // Build forecast sections organized by LENS (appendix if timeframes exist, primary otherwise)
  const forecastByLens = LENSES.map((lens) => {
    const model = LENS_MODELS[lens.id];
    const rawForecast = params.forecasts[lens.id];

    if (useStructuredForecasts && isStructuredForecast(rawForecast)) {
      const sections = TIMEFRAMES.map((tf) => {
        const tfData = rawForecast.timeframes[tf.id as keyof typeof rawForecast.timeframes];
        if (!tfData) return "";
        return `
=== ${escapeTypstChars(tf.label)}

${renderStructuredTimeframe(tfData)}
`;
      }).join("\n");
      return `
== ${lens.name} Lens

#text(size: 9pt, fill: muted)[_Agent: ${model} (via OpenRouter)_]

${escapeTypstChars(rawForecast.lensAssessment)}

${sections}
`;
    } else {
      const legacy = legacyForecasts[lens.id];
      const content = legacy?.full ?? "No forecast generated.";
      return `
== ${lens.name} Lens

#text(size: 9pt, fill: muted)[_Agent: ${model} (via OpenRouter)_]

${markdownToTypst(content)}
`;
    }
  }).join("\n");

  // Build run analysis metadata
  const agentSummary = LENSES.map((lens) => {
    const model = LENS_MODELS[lens.id];
    const rawForecast = params.forecasts[lens.id];
    const hasContent = isStructuredForecast(rawForecast) || !!legacyForecasts[lens.id]?.full;
    return `- *${lens.name}*: ${model} ${hasContent ? "\\u{2713}" : "\\u{2717}"}`;
  }).join("\n");

  return `
${typstPreamble({ title: "Geopolitical Forecast Report", sessionId: params.sessionId, timestamp, generatedAt })}

// ─── Cover Page ───

#v(2cm)

#align(center)[
  #text(size: 10pt, fill: muted, tracking: 0.2em, weight: "medium")[GEOPOL FORECASTER]
  #v(0.5cm)
  #line(length: 50%, stroke: 1.5pt + accent)
  #v(0.5cm)
  #text(size: 26pt, weight: "bold", fill: accent)[Geopolitical Forecast Report]
  #v(0.3cm)
  #text(size: 13pt, fill: muted)[Iran\\–Israel\\–US Conflict Assessment]
  #v(0.3cm)
  #text(size: 10.5pt, fill: muted)[${timestamp}]
]

#v(1.5cm)

#align(center)[
  #block(
    width: 65%,
    inset: 16pt,
    radius: 4pt,
    stroke: 0.5pt + border,
    fill: rgb("#f7fafc"),
  )[
    #set text(size: 9pt)
    #grid(
      columns: (auto, 1fr),
      column-gutter: 12pt,
      row-gutter: 6pt,
      text(fill: muted)[Session],
      text(font: "IBM Plex Mono")[${escapeTypstChars(params.sessionId.slice(0, 8))}],
      text(fill: muted)[Lenses],
      [6 parallel analytical perspectives],
      text(fill: muted)[Timeframes],
      [24h, 1 Week, 1 Month, 1 Year],
      text(fill: muted)[Pipeline],
      [Gather \\u{2192} SITREP \\u{2192} Forecast \\u{2192} Synthesize],
    )
  ]
]

#v(2cm)

#align(center)[
  #line(length: 30%, stroke: 0.5pt + border)
  #v(0.3cm)
  #text(size: 8.5pt, fill: muted)[Multi-agent intelligence analysis system]
]

#pagebreak()

// ─── Table of Contents ───

#align(center)[
  #text(size: 18pt, weight: "bold", fill: accent)[Contents]
  #v(0.3cm)
  #line(length: 40%, stroke: 0.5pt + border)
]

#v(0.8cm)

#outline(title: none, indent: 1.5em, depth: 2)

#pagebreak()

// ─── Executive Summary ───

= Executive Summary

#text(size: 9pt, fill: muted)[_Synthesized by: Grok 4.1 Fast (via OpenRouter) from all six forecast lenses_]

#v(0.3cm)

${useStructuredSummary ? renderStructuredSummary(params.summary as StructuredSummary) : markdownToTypst(typeof params.summary === "string" ? params.summary : JSON.stringify(params.summary))}

#pagebreak()

// ─── Situation Report ───

${sitrepContent}

${sitrepContent ? "#pagebreak()" : ""}

// ─── Ground Truth ───

= Ground Truth (Confirmed)

#text(size: 9pt, fill: muted)[_Sources: Gemini 3.1 Flash Lite (Google Search grounding) + Grok 4.1 Fast_]

#v(0.3cm)

${markdownToTypst(params.groundTruth)}

#pagebreak()

// ─── Forecasts by Time Horizon (primary view) ───

${hasTimeframes ? forecastByTimeframe : ""}

${hasTimeframes ? "#pagebreak()" : ""}

// ─── Forecasts by Lens (${hasTimeframes ? "appendix" : "primary view"}) ───

= ${hasTimeframes ? "Appendix A: " : ""}Scenario Forecasts by Lens

${hasTimeframes
  ? `#text(size: 9pt, fill: muted)[_Full unabridged output from each agent, presented by analytical perspective._]`
  : `#text(size: 9pt, fill: muted)[_Six parallel analytical lenses, each producing forecasts across four time horizons._]`
}

#v(0.3cm)

${forecastByLens}

#pagebreak()

// ─── Run Analysis ───

= ${hasTimeframes ? "Appendix B: " : ""}Run Analysis

#text(size: 9pt, fill: muted)[_Pipeline execution metadata_]

#v(0.3cm)

#table(
  columns: (1fr, 2fr),
  stroke: 0.5pt + border,
  inset: 8pt,
  [*Session ID*], [#text(font: "IBM Plex Mono")[${escapeTypstChars(params.sessionId.slice(0, 8))}]],
  [*Timestamp*], [${timestamp}],
  [*Ground Truth Sources*], [Gemini 3.1 Flash Lite (search-grounded) + Grok 4.1 Fast],
  [*SITREP Agent*], [Gemini 3.1 Flash Lite (via OpenRouter)],
  [*Forecast Agents*], [6 parallel lenses (see below)],
  [*Summary Agent*], [Grok 4.1 Fast (via OpenRouter)],
)

#v(0.4cm)

*Forecast Agent Assignments:*

${agentSummary}
`;
}
