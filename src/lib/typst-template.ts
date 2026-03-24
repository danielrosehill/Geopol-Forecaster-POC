import { LENSES } from "./types";

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
      // Collect all contiguous table lines
      let j = i + 1;
      while (j < lines.length && /^\|(.+\|)+\s*$/.test(lines[j])) {
        tableLines.push(lines[j]);
        j++;
      }
      i = j - 1; // advance past table

      // Parse: first line = headers, second = separator (skip), rest = data
      const parseRow = (row: string) =>
        row.split("|").slice(1, -1).map((c) => c.trim());

      const headers = parseRow(tableLines[0]);
      const dataRows = tableLines
        .slice(2) // skip header + separator
        .filter((r) => !/^[|\s:-]+$/.test(r)) // skip separator-only rows
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
      // Content headings are nested inside == sections, so offset by 1
      // Markdown # → === (level 3), ## → === (level 3), ### → ==== (level 4)
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

  return output.join("\n");
}

/**
 * Convert inline markdown formatting to Typst.
 * Handles: bold, italic, bold+italic, inline code, links.
 * Also escapes Typst special characters in remaining text.
 */
function convertInline(text: string): string {
  // Process inline code first (protect from other transformations)
  const codeSegments: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSegments.length;
    codeSegments.push(`#raw("${code.replace(/"/g, '\\"')}")`);
    return `%%CODE${idx}%%`;
  });

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    return `#link("${url}")[${escapeTypstChars(linkText)}]`;
  });

  // Bold+italic: ***text*** or ___text___
  text = text.replace(/\*{3}([^*]+)\*{3}/g, (_, t) => `*_${escapeTypstChars(t)}_*`);
  text = text.replace(/_{3}([^_]+)_{3}/g, (_, t) => `*_${escapeTypstChars(t)}_*`);

  // Bold: **text** or __text__
  text = text.replace(/\*{2}([^*]+)\*{2}/g, (_, t) => `*${escapeTypstChars(t)}*`);
  text = text.replace(/_{2}([^_]+)_{2}/g, (_, t) => `*${escapeTypstChars(t)}*`);

  // Italic: *text* or _text_
  text = text.replace(/\*([^*]+)\*/g, (_, t) => `_${escapeTypstChars(t)}_`);
  text = text.replace(/(?<![a-zA-Z])_([^_]+)_(?![a-zA-Z])/g, (_, t) => `_${escapeTypstChars(t)}_`);

  // Escape remaining Typst special characters in non-formatted text
  // We need to be careful not to double-escape parts we already formatted
  text = escapeRemainingTypst(text);

  // Restore code segments
  for (let i = 0; i < codeSegments.length; i++) {
    text = text.replace(`%%CODE${i}%%`, codeSegments[i]);
  }

  return text;
}

/** Escape characters that are special in Typst but NOT markdown formatting chars */
function escapeTypstChars(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>");
}

/** Escape remaining Typst specials in text that may contain already-formatted Typst markup */
function escapeRemainingTypst(text: string): string {
  // Split by Typst formatting markers we've already placed, escape only the gaps
  // Simple approach: escape $ # @ < > but leave * _ (used for bold/italic in Typst)
  return text
    .replace(/(?<!\\)#(?![a-z])/g, "\\#")  // # not followed by typst function
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
  outlook: "12–24 Hour Outlook",
};

export function buildTypstSource(params: {
  sessionId: string;
  createdAt: string;
  groundTruth: string;
  sitrep: Record<string, string> | null;
  forecasts: Record<string, string>;
  summary: string;
}): string {
  const timestamp = new Date(params.createdAt).toUTCString();

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

#text(size: 9pt, fill: rgb("#666"))[_Generated by: Gemini 3.1 Flash Lite (via OpenRouter)_]

${sections}

#pagebreak()
`;
  }

  // Build forecast sections with agent attribution
  const forecastSections = LENSES.map((lens) => {
    const content = params.forecasts[lens.id] ?? "No forecast generated.";
    const model = LENS_MODELS[lens.id];
    return `
== ${lens.name} Lens

#text(size: 9pt, fill: rgb("#666"))[_Agent: ${model} (via OpenRouter)_]

${markdownToTypst(content)}
`;
  }).join("\n");

  // Build run analysis metadata
  const agentSummary = LENSES.map((lens) => {
    const model = LENS_MODELS[lens.id];
    const hasContent = !!params.forecasts[lens.id];
    return `- *${lens.name}*: ${model} ${hasContent ? "\\u{2713}" : "\\u{2717}"}`;
  }).join("\n");

  return `
#set document(title: "Geopolitical Forecast Report", author: "Geopol Forecaster")
#set page(
  paper: "a4",
  margin: (top: 2.5cm, bottom: 2.5cm, left: 2cm, right: 2cm),
  header: align(right, text(size: 9pt, fill: rgb("#666"))[
    Geopol Forecaster \\— Session ${escapeTypstChars(params.sessionId.slice(0, 8))}
  ]),
  footer: context {
    let current = counter(page).get().first()
    let total = counter(page).final().first()
    grid(
      columns: (1fr, 1fr),
      align(left, text(size: 8pt, fill: rgb("#999"))[
        Generated: ${timestamp}
      ]),
      align(right, text(size: 8pt, fill: rgb("#999"))[
        Page #current of #total
      ]),
    )
  },
)
#set text(font: "New Computer Modern", size: 11pt)
#set heading(numbering: (..nums) => {
  let n = nums.pos()
  if n.len() <= 2 { numbering("1.1", ..nums) }
})
#set par(justify: true)

#align(center)[
  #text(size: 22pt, weight: "bold")[Geopolitical Forecast Report]
  #v(0.3cm)
  #text(size: 12pt, fill: rgb("#555"))[Iran\\–Israel\\–US Conflict Assessment]
  #v(0.3cm)
  #text(size: 10pt, fill: rgb("#777"))[${timestamp}]
  #v(0.2cm)
  #line(length: 60%, stroke: 0.5pt + rgb("#ccc"))
]

#v(1cm)

= Executive Summary

#text(size: 9pt, fill: rgb("#666"))[_Synthesized by: Grok 4.1 Fast (via OpenRouter) from all six forecast lenses_]

#v(0.3cm)

${markdownToTypst(params.summary)}

#pagebreak()

= Run Analysis

#text(size: 9pt, fill: rgb("#666"))[_Pipeline execution metadata_]

#v(0.3cm)

#table(
  columns: (1fr, 2fr),
  stroke: 0.5pt + rgb("#ccc"),
  inset: 8pt,
  [*Session ID*], [#raw("${params.sessionId.slice(0, 8)}")],
  [*Timestamp*], [${timestamp}],
  [*Ground Truth Sources*], [Gemini 3.1 Flash Lite (search-grounded) + Grok 4.1 Fast],
  [*SITREP Agent*], [Gemini 3.1 Flash Lite (via OpenRouter)],
  [*Forecast Agents*], [6 parallel lenses (see below)],
  [*Summary Agent*], [Grok 4.1 Fast (via OpenRouter)],
)

#v(0.4cm)

*Forecast Agent Assignments:*

${agentSummary}

#pagebreak()

${sitrepContent}

= Ground Truth (Confirmed)

#text(size: 9pt, fill: rgb("#666"))[_Sources: Gemini 3.1 Flash Lite (Google Search grounding) + Grok 4.1 Fast_]

#v(0.3cm)

${markdownToTypst(params.groundTruth)}

#pagebreak()

= Scenario Forecasts

${forecastSections}
`;
}
