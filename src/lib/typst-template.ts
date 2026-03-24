import { LENSES } from "./types";

function escapeTypst(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_");
}

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

${escapeTypst(content)}
`;
      })
      .filter(Boolean)
      .join("\n");

    sitrepContent = `
= Situation Report

${sections}

#pagebreak()
`;
  }

  const forecastSections = LENSES.map((lens) => {
    const content = params.forecasts[lens.id] ?? "No forecast generated.";
    return `
== ${lens.name} Lens

${escapeTypst(content)}
`;
  }).join("\n");

  return `
#set document(title: "Geopolitical Forecast Report", author: "Geopol Forecaster")
#set page(
  paper: "a4",
  margin: (top: 2.5cm, bottom: 2.5cm, left: 2cm, right: 2cm),
  header: align(right, text(size: 9pt, fill: rgb("#666"))[
    Geopol Forecaster — Session ${escapeTypst(params.sessionId.slice(0, 8))}
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
#set heading(numbering: "1.")
#set par(justify: true)

#align(center)[
  #text(size: 22pt, weight: "bold")[Geopolitical Forecast Report]
  #v(0.3cm)
  #text(size: 12pt, fill: rgb("#555"))[Iran–Israel–US Conflict Assessment]
  #v(0.3cm)
  #text(size: 10pt, fill: rgb("#777"))[${timestamp}]
  #v(0.2cm)
  #line(length: 60%, stroke: 0.5pt + rgb("#ccc"))
]

#v(1cm)

= Executive Summary

${escapeTypst(params.summary)}

#pagebreak()

${sitrepContent}

= Ground Truth (Confirmed)

${escapeTypst(params.groundTruth)}

#pagebreak()

= Scenario Forecasts

${forecastSections}
`;
}
