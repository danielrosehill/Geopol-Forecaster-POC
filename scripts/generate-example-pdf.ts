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
      neutral: `## Next 24 Hours (By March 25, 2026, 18:03 UTC)

**Overview**: Immediate retaliation cycles intensify amid Israeli fatality trigger and Lebanese diplomatic rupture. Miscalculation risks high from fragmented command chains.

### Primary Scenarios:

- **High-Probability Escalation (75%)**: Hezbollah responds to ambassador expulsion with 5,000+ rocket salvo from southern Lebanon. Northern Israel sees 50+ civilian casualties; IDF ground incursion into Lebanon begins.

- **US Miscalculation Trigger (60%)**: US carrier strike group intercepts Houthi/Iranian drones near Bab el-Mandeb; one US vessel damaged, killing 20 sailors — CENTCOM authorizes Tomahawk strikes on Iranian coastal missile sites.

## Next 1 Week

**Trajectory**: Escalation ladder reaches Level 4-5. Multiple fronts active simultaneously, stretching all parties' resources. Diplomatic back-channels exist but are not being utilized effectively.`,
      pessimistic: `## Next 24 Hours (By March 25, 2026)

**Overview**: Worst-case modeling emphasizes cascading failures across multiple theaters.

### Critical Risks:

- **Full Regional War (45%)**: Iranian retaliation triggers Israeli strategic strikes on nuclear facilities. Russia provides intelligence support to Iran. Gulf states drawn in as energy infrastructure targeted.

- **Strait of Hormuz Closure (60%)**: IRGC mines placed in shipping lanes. Oil prices spike to $200/barrel within 48 hours. Global economic shockwave.

- **Nuclear Threshold (15%)**: If conventional deterrence fails, intelligence suggests Iran has enough enriched material for 2-3 devices. This remains low probability but catastrophic risk.

## Next 1 Week

**Assessment**: Each day of continued escalation reduces the probability of diplomatic off-ramps by approximately 8-10%. By day 7, we model a 70% chance of irreversible regional conflict.`,
      optimistic: `## Next 24 Hours

**De-escalation Pathways**:

- **Back-channel Success (25%)**: Turkish mediation achieves 48-hour ceasefire framework. Both sides claim victory while stepping back from the brink.

- **Gulf Pressure (20%)**: Saudi Arabia and UAE threaten to suspend diplomatic recognition of Israel (Abraham Accords) unless strikes halt. This provides Israel political cover to pause.

## Next 1 Week

**Best Case**: If initial ceasefire holds, expect:
1. UN observer deployment to Lebanon border
2. Gradual Hormuz reopening
3. Resumption of Vienna-format talks with expanded mandate`,
      blindsides: `## Black Swan Events to Monitor

### 1. Internal Iranian Power Shift (10%)
IRGC hardliners stage internal coup, removing moderating influences. New command structure may be *more* risk-tolerant, not less.

### 2. Chinese Naval Deployment (8%)
PLA Navy sends destroyer group to Gulf of Oman "to protect shipping." First direct Chinese military involvement in Middle East theatre.

### 3. Israeli Intelligence Failure (12%)
A major intelligence gap is revealed — Iran has deployed mobile launch platforms to locations not covered by satellite surveillance. Surprise strike on Tel Aviv suburbs with conventional warheads.

### 4. Global Financial Contagion (30%)
Oil price spike triggers sovereign debt crises in emerging markets. G7 emergency summit called. Economic pressure forces diplomatic intervention where politics alone could not.`,
      probabilistic: `## Probability-Weighted Outcome Matrix

### 24-Hour Forecasts

| Outcome | Probability | Confidence |
|---------|------------|------------|
| Continued tit-for-tat strikes | 75% | High |
| Ceasefire attempt | 20% | Medium |
| Major escalation (new theater) | 35% | Medium |
| Nuclear threshold event | 2% | Low |
| Diplomatic breakthrough | 5% | Low |

### Key Drivers (Bayesian Analysis)

**P(Regional War | Current Trajectory)** = 0.45 ± 0.12
- Updated from base rate of 0.15 given: direct state strikes, carrier positioning, Hormuz disruption
- Each additional day of kinetic exchange increases P by ~0.04

**P(Ceasefire within 7 days)** = 0.22 ± 0.08
- Conditional on no mass casualty event (>100 deaths single incident)
- Rises to 0.40 if US applies serious economic pressure on Israel`,
      historical: `## Historical Precedent Analysis

### Most Relevant Analogues:

**1. 1973 Yom Kippur War → October 1973**
- *Parallel*: Multi-front surprise engagement, US carrier deployment, oil weapon
- *Outcome*: 18 days of fighting → Kissinger shuttle diplomacy → disengagement agreements
- *Implication*: Expect 2-3 weeks of high-intensity conflict before exhaustion creates diplomatic space

**2. Iran-Iraq War Tanker Phase (1984-88)**
- *Parallel*: Strait of Hormuz escalation, attacks on commercial shipping
- *Outcome*: International naval escorts, gradual de-escalation through economic exhaustion
- *Implication*: Hormuz situation likely to persist for months, not days

**3. 2006 Lebanon War**
- *Parallel*: Hezbollah rocket saturation, Israeli air campaign, civilian casualties
- *Outcome*: 34 days → UNSCR 1701 → fragile ceasefire
- *Implication*: Northern front alone could sustain 4-5 weeks of conflict`,
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
