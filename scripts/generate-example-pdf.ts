/**
 * Generate an example PDF report from the last session in the DB,
 * or from sample data if the DB is empty.
 *
 * Usage: npx tsx scripts/generate-example-pdf.ts
 */
import { buildTypstSource } from "../src/lib/typst-template";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "data", "geopol.db");
const OUTPUT_PATH = join(__dirname, "..", "examples", "example-report.pdf");

interface DbRow {
  id: string;
  created_at: string;
  step: string;
  ground_truth: string | null;
  sitrep: string | null;
  forecasts: string | null;
  summary: string | null;
}

function getLastSession(): DbRow | null {
  if (!existsSync(DB_PATH)) return null;
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare(
    "SELECT * FROM sessions WHERE step = 'done' ORDER BY created_at DESC LIMIT 1"
  ).get() as DbRow | undefined;
  db.close();
  return row ?? null;
}

function generatePdf(typstSource: string, outputPath: string) {
  const tmpPath = outputPath.replace(".pdf", ".typ");
  const dir = join(outputPath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmpPath, typstSource, "utf-8");

  try {
    execFileSync("typst", ["compile", tmpPath, outputPath], {
      stdio: "pipe",
      timeout: 30_000,
    });
    console.log(`PDF generated: ${outputPath}`);
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer };
    console.error("Typst compilation failed:");
    console.error(e.stderr?.toString() ?? err);
    process.exit(1);
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

// Try to load from DB first
const session = getLastSession();

if (session && session.ground_truth && session.forecasts && session.summary) {
  console.log(`Found completed session: ${session.id.slice(0, 8)} (${session.created_at})`);

  const sitrep = session.sitrep ? JSON.parse(session.sitrep) : null;
  const forecasts = JSON.parse(session.forecasts);

  const source = buildTypstSource({
    sessionId: session.id,
    createdAt: session.created_at,
    groundTruth: session.ground_truth,
    sitrep,
    forecasts,
    summary: session.summary,
  });

  generatePdf(source, OUTPUT_PATH);
} else {
  console.log("No completed session in DB. Generating from sample data...");

  const source = buildTypstSource({
    sessionId: "example-0001-demo-report",
    createdAt: new Date().toISOString(),
    groundTruth: `## Current Situation (March 24, 2026)

**Iran-Israel Escalation**: Following the collapse of the Vienna back-channel on March 18, tensions have sharply escalated:

- **Israeli airstrikes** hit targets in Isfahan province targeting suspected enrichment facilities
- **Iran launched 150+ ballistic missiles** at Israeli military installations, with ~85% intercepted
- **Hezbollah activated** with sustained rocket barrages into northern Israel (5,000+ rockets in 72h)
- **US carrier strike group** (USS Abraham Lincoln) repositioned to eastern Mediterranean
- **Strait of Hormuz**: Iranian IRGC-N conducted "exercises" restricting 30% of tanker traffic

### Diplomatic Status

- **UN Security Council**: Emergency session called; Russia and China blocked resolution
- **US Position**: "Iron-clad support for Israel's right to self-defense" — State Dept spokesperson
- **Gulf States**: Saudi Arabia and UAE issued joint statement calling for "immediate restraint"
- **Turkey**: Offered mediation; rejected by both sides`,
    sitrep: {
      key_takeaways: `1. **The conflict has entered a high-intensity phase** of direct state-on-state kinetic exchanges involving both mainland Iran and critical regional energy infrastructure.

2. **The Lebanese-Iranian diplomatic rupture** signifies critical fractures within the 'Axis of Resistance' internal command structure.

3. **Israel's massive, sustained strike campaign** against Iranian missile storage and launch infrastructure indicates an intent to neutralize Tehran's long-range pre-emptive strike capability.`,
      coalition_ops: `**US Forces**: The USS Abraham Lincoln carrier strike group has repositioned to provide enhanced air defense coverage. CENTCOM authorized defensive Tomahawk strikes on Iranian coastal missile sites after one US vessel was damaged.

**Key Development**: Trump administration statements have shown tension between intervention and diplomacy — public rhetoric escalates while back-channel communications reportedly continue.`,
      northern_front: `**Hezbollah** has unleashed massive rocket barrages targeting northern Israel, with 5,000+ projectiles launched over 72 hours. Israeli response includes sustained airstrikes on southern Lebanon infrastructure.

**Assessment**: The northern front represents the most significant drain on Israeli air defense resources, with Iron Dome interception rates dropping from 95% to ~85% due to volume saturation.`,
    },
    forecasts: {
      neutral: {
        full: `## Next 24 Hours\n\n**Overview**: Immediate retaliation cycles intensify amid Israeli fatality trigger and Lebanese diplomatic rupture.\n\n## Next 1 Week\n\n**Trajectory**: Escalation ladder reaches Level 4-5. Multiple fronts active simultaneously.\n\n## Next 1 Month\n\n**Assessment**: Conflict likely stabilizes into attritional pattern with periodic escalation spikes.\n\n## Next 1 Year\n\n**Outlook**: Regional security architecture fundamentally reshaped regardless of outcome.`,
        timeframes: {
          "24h": `**Overview**: Immediate retaliation cycles intensify amid Israeli fatality trigger and Lebanese diplomatic rupture. Miscalculation risks high from fragmented command chains.\n\n**Primary Scenarios:**\n\n- **High-Probability Escalation (75%)**: Hezbollah responds to ambassador expulsion with 5,000+ rocket salvo from southern Lebanon. Northern Israel sees 50+ civilian casualties; IDF ground incursion into Lebanon begins.\n\n- **US Miscalculation Trigger (60%)**: US carrier strike group intercepts Houthi/Iranian drones near Bab el-Mandeb; one US vessel damaged — CENTCOM authorizes Tomahawk strikes on Iranian coastal missile sites.`,
          "1w": `**Trajectory**: Escalation ladder reaches Level 4-5. Multiple fronts active simultaneously, stretching all parties' resources. Diplomatic back-channels exist but are not being utilized effectively.\n\n- Israeli air operations expand to include Iranian port infrastructure\n- Hezbollah rocket stocks estimated at 60% capacity\n- US Congress debates Authorization for Use of Military Force`,
          "1m": `**Assessment**: Conflict likely stabilizes into an attritional pattern. Key indicators:\n\n- Ceasefire negotiations begin but stall on preconditions\n- Economic damage forces Gulf states to intensify mediation\n- Iran's missile production capacity becomes the binding constraint`,
          "1y": `**Outlook**: Regional security architecture fundamentally reshaped. New deterrence equilibrium emerges based on demonstrated capabilities. Abraham Accords framework either collapses or is reinforced through crisis.`,
        },
      },
      pessimistic: {
        full: `## Next 24 Hours\n\n**Overview**: Worst-case modeling emphasizes cascading failures across multiple theaters.\n\n## Next 1 Week\n\n**Assessment**: Each day of continued escalation reduces diplomatic off-ramp probability by 8-10%.`,
        timeframes: {
          "24h": `**Overview**: Worst-case modeling emphasizes cascading failures across multiple theaters.\n\n**Critical Risks:**\n\n- **Full Regional War (45%)**: Iranian retaliation triggers Israeli strategic strikes on nuclear facilities. Russia provides intelligence support to Iran.\n\n- **Strait of Hormuz Closure (60%)**: IRGC mines placed in shipping lanes. Oil prices spike to $200/barrel within 48 hours.\n\n- **Nuclear Threshold (15%)**: If conventional deterrence fails, intelligence suggests Iran has enough enriched material for 2-3 devices.`,
          "1w": `**Assessment**: Each day of continued escalation reduces the probability of diplomatic off-ramps by approximately 8-10%. By day 7, we model a 70% chance of irreversible regional conflict.\n\n- Multiple civilian mass-casualty events likely\n- Global oil supply disruption triggers emergency reserves release\n- NATO Article 5 discussions begin regarding Eastern Mediterranean assets`,
          "1m": `**Catastrophic Scenario**: Full theater-wide conflict involving 6+ state actors. Estimated economic damage exceeds $2 trillion globally. Refugee flows destabilize Jordan and Iraq.\n\n- Iranian enrichment program accelerates under cover of conflict\n- Israeli strategic reserve exhaustion forces difficult choices\n- US domestic political crisis over Middle East involvement deepens`,
          "1y": `**Worst Case**: Prolonged regional war with no clear resolution. Nuclear proliferation cascades as Saudi Arabia and Turkey pursue independent programs. Global energy transition accelerates but at enormous humanitarian cost.`,
        },
      },
      optimistic: {
        full: `## Next 24 Hours\n\n**De-escalation Pathways**: Turkish mediation or Gulf pressure could achieve ceasefire.\n\n## Next 1 Week\n\n**Best Case**: UN observer deployment, Hormuz reopening, Vienna talks resume.`,
        timeframes: {
          "24h": `**De-escalation Pathways:**\n\n- **Back-channel Success (25%)**: Turkish mediation achieves 48-hour ceasefire framework. Both sides claim victory while stepping back from the brink.\n\n- **Gulf Pressure (20%)**: Saudi Arabia and UAE threaten to suspend diplomatic recognition of Israel (Abraham Accords) unless strikes halt. This provides Israel political cover to pause.`,
          "1w": `**Best Case**: If initial ceasefire holds, expect:\n\n1. UN observer deployment to Lebanon border\n2. Gradual Hormuz reopening\n3. Resumption of Vienna-format talks with expanded mandate\n\nKey enabler: US shifts from military support to active mediation under domestic pressure.`,
          "1m": `**Diplomatic Breakthrough**: Comprehensive framework emerges linking:\n\n- Iran nuclear program transparency for sanctions relief\n- Hezbollah disarmament timeline tied to Lebanese governance reform\n- Gulf security architecture with US, European, and Chinese guarantees`,
          "1y": `**New Regional Order**: Crisis becomes catalyst for restructured Middle East security. Iran integrated into economic framework. Israeli-Saudi normalization proceeds with Palestinian state pathway.`,
        },
      },
      blindsides: {
        full: `## Black Swan Events to Monitor\n\n### 1. Internal Iranian Power Shift (10%)\nIRGC hardliners stage internal coup.\n\n### 2. Chinese Naval Deployment (8%)\nPLA Navy sends destroyer group to Gulf of Oman.\n\n### 3. Israeli Intelligence Failure (12%)\nMobile launch platforms at undiscovered locations.\n\n### 4. Global Financial Contagion (30%)\nOil spike triggers sovereign debt crises.`,
        timeframes: {
          "24h": `**Black Swan Events to Monitor:**\n\n- **Internal Iranian Power Shift (10%)**: IRGC hardliners stage internal coup, removing moderating influences. New command structure may be *more* risk-tolerant, not less.\n\n- **Israeli Intelligence Failure (12%)**: Iran has deployed mobile launch platforms to locations not covered by satellite surveillance. Surprise strike on Tel Aviv suburbs.`,
          "1w": `**Emerging Wildcards:**\n\n- **Chinese Naval Deployment (8%)**: PLA Navy sends destroyer group to Gulf of Oman "to protect shipping." First direct Chinese military involvement in Middle East theatre.\n\n- **Global Financial Contagion (30%)**: Oil price spike triggers sovereign debt crises in emerging markets. G7 emergency summit called.`,
          "1m": `**Structural Surprises:**\n\n- **Russian Opportunism**: Moscow uses Middle East distraction to escalate in Ukraine or Moldova\n- **Cyber Escalation**: State-sponsored attacks on critical infrastructure (power grids, financial systems) escalate beyond kinetic warfare\n- **Domestic Upheaval in Iran**: Economic pressure triggers widespread protests forcing regime to choose between war and survival`,
          "1y": `**Paradigm Shifts:**\n\n- **Nuclear Breakout**: Iran or another regional actor achieves nuclear capability, fundamentally altering deterrence calculus\n- **US Withdrawal**: Domestic political realignment forces complete US disengagement from Middle East security\n- **Climate-Conflict Nexus**: Water scarcity accelerates, making resource conflicts inseparable from geopolitical ones`,
        },
      },
      probabilistic: {
        full: `## Probability-Weighted Outcome Matrix\n\n| Outcome | Probability | Confidence |\n|---------|------------|------------|\n| Continued tit-for-tat strikes | 75% | High |\n| Ceasefire attempt | 20% | Medium |\n| Major escalation (new theater) | 35% | Medium |`,
        timeframes: {
          "24h": `**Probability-Weighted Outcome Matrix:**\n\n| Outcome | Probability | Confidence |\n|---------|------------|------------|\n| Continued tit-for-tat strikes | 75% | High |\n| Ceasefire attempt | 20% | Medium |\n| Major escalation (new theater) | 35% | Medium |\n| Nuclear threshold event | 2% | Low |\n| Diplomatic breakthrough | 5% | Low |\n\n**P(Regional War | Current Trajectory)** = 0.45 +/- 0.12`,
          "1w": `**7-Day Forecast:**\n\n**P(Ceasefire within 7 days)** = 0.22 +/- 0.08\n- Conditional on no mass casualty event (>100 deaths single incident)\n- Rises to 0.40 if US applies serious economic pressure on Israel\n\n**P(Hormuz Reopening)** = 0.15 +/- 0.05\n- Insurance markets pricing 85% disruption probability`,
          "1m": `**30-Day Cumulative Probabilities:**\n\n| Outcome | P(by Day 30) |\n|---------|-------------|\n| Formal ceasefire | 38% |\n| Regional war (3+ state actors) | 52% |\n| Nuclear incident | 5% |\n| Status quo ante restoration | 3% |\n\nNote: Probabilities do not sum to 100% as outcomes are not mutually exclusive.`,
          "1y": `**12-Month Scenario Distribution:**\n\n- **Frozen Conflict (35%)**: Low-intensity hostilities persist without resolution\n- **Negotiated Settlement (25%)**: Comprehensive deal reached under economic pressure\n- **Expanded War (20%)**: Conflict draws in additional state actors\n- **Decisive Victory (15%)**: One side achieves strategic objectives\n- **Nuclear Crisis (5%)**: Threshold crossed, fundamentally changing dynamics`,
        },
      },
      historical: {
        full: `## Historical Precedent Analysis\n\n**1. 1973 Yom Kippur War**: Multi-front engagement, 18 days, Kissinger shuttle diplomacy\n\n**2. Iran-Iraq Tanker Phase (1984-88)**: Hormuz escalation, naval escorts\n\n**3. 2006 Lebanon War**: 34 days, UNSCR 1701`,
        timeframes: {
          "24h": `**Most Relevant Analogues for Immediate Period:**\n\n**1973 Yom Kippur War — First 48 Hours**\n- *Parallel*: Multi-front surprise engagement, US carrier deployment, oil weapon\n- *Key Lesson*: Initial chaos gives way to organized response within 48-72 hours\n- *Implication*: Expect command structures to consolidate, reducing miscalculation risk slightly`,
          "1w": `**Week-Scale Historical Patterns:**\n\n**1973 Yom Kippur War — Days 3-10**\n- *Outcome*: Initial territorial gains reversed; diplomatic pressure builds\n- *Implication*: Expect battlefield dynamics to shift as reserves mobilize\n\n**2006 Lebanon War — First Week**\n- *Parallel*: Hezbollah rocket saturation, Israeli air campaign, civilian casualties\n- *Lesson*: Air power alone insufficient; ground operations become necessary`,
          "1m": `**Month-Scale Analogues:**\n\n**1973 War — Resolution Phase**\n- 18 days of fighting then Kissinger shuttle diplomacy then disengagement agreements\n- *Implication*: Expect 2-3 weeks of high-intensity conflict before exhaustion creates diplomatic space\n\n**Iran-Iraq War Tanker Phase (1984-88)**\n- Strait of Hormuz escalation persisted for months with international naval escorts\n- *Implication*: Hormuz situation likely to persist for months, not days`,
          "1y": `**Year-Scale Historical Outcomes:**\n\n**Post-1973 Realignment**\n- Camp David Accords emerged from war crisis (5 years later)\n- *Implication*: Current crisis may catalyze major diplomatic realignment on 2-5 year horizon\n\n**Post-2006 Equilibrium**\n- UNSCR 1701 created fragile but lasting ceasefire framework\n- *Implication*: Northern front resolution possible through international mechanism`,
        },
      },
    },
    summary: `## Executive Summary: Iran-Israel-US Conflict Forecast Synthesis

**Date**: March 24, 2026
**Analyst**: Senior Geopolitical Analyst
**Sources**: Six independent analytical lenses (Neutral, Pessimistic, Optimistic, Blindsides, Probabilistic, Historical)

### Consensus Themes Across Lenses

All six analytical perspectives agree on three core assessments:

1. **The conflict has entered a qualitatively different phase.** Direct state-on-state kinetic exchanges between Iran and Israel, combined with Hezbollah activation and Strait of Hormuz disruption, represent a simultaneous multi-theater escalation unprecedented in the modern Middle East.

2. **The next 48-72 hours are critical.** Every lens identifies this window as the inflection point — either diplomatic off-ramps are activated, or escalation dynamics become self-reinforcing and increasingly difficult to reverse.

3. **US positioning is the key variable.** The Abraham Lincoln carrier group's actions and Washington's diplomatic posture will determine whether this escalates to full regional war or finds a corridor to de-escalation.

### Key Divergences

- **Neutral vs. Pessimistic** on escalation speed: Neutral estimates 60% chance of containment within current parameters; Pessimistic models 45% probability of full regional war within 7 days.
- **Probabilistic vs. Historical** on duration: Probabilistic suggests resolution within 2 weeks if P(ceasefire) conditions are met; Historical analogues (1973, 2006) suggest 3-5 weeks minimum.
- **Optimistic stands alone** in assigning meaningful probability (25%) to near-term ceasefire via Turkish mediation.

### Highest-Confidence Predictions (Multi-Lens Agreement)

- **Continued kinetic exchanges for minimum 7 days** (5/6 lenses agree, >80% confidence)
- **Oil prices will exceed $150/barrel within 72 hours** (6/6 lenses agree)
- **Hezbollah rocket campaign will intensify before any ceasefire** (5/6 lenses agree)
- **At least one major civilian casualty event (>50 deaths)** will drive international pressure (4/6 lenses agree)

### Critical Uncertainties

- Iranian nuclear program status — intelligence gap identified by Blindsides lens
- Internal IRGC command dynamics — potential for autonomous escalation decisions
- Chinese/Russian response — could fundamentally alter strategic calculus
- Global financial contagion speed — economic pressure may be the fastest path to ceasefire`,
  });

  generatePdf(source, OUTPUT_PATH);
}
