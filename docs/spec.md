# Geopol Forecaster — POC Spec

## Overview

Multi-agent geopolitical forecasting tool. For the POC, the focus area is fixed: the Iran–Israel–US conflict. Users run prediction sessions that gather current intelligence, generate scenario forecasts from multiple analytical lenses, and produce a timestamped PDF report.

Sessions are persisted in a lightweight backend — past predictions retain analytical value.

## Pipeline

### 1. State Gathering

The orchestrator agent dispatches two subagents (Gemini 3.1 Lite with search grounding + Groq for near real-time fill) to collect situational updates across four windows: 3h, 6h, 12h, 24h.

Combined outputs are merged with foundational background context (ground truth) about the conflict.

The agent produces a **Draft Ground Truth** document: a detailed, neutral, section-by-section account of the current position — written for AI consumption, with no predictions. All timestamps in UTC.

### 2. User Review

The user reviews the Draft Ground Truth, corrects errors, adds missing details, and confirms.

### 3. Scenario Modelling

The confirmed ground truth is sent to six subagents, each producing forecasts across four timeframes: **24 hours, 1 week, 1 month, 1 year**.

| # | Lens | Directive |
|---|------|-----------|
| 1 | **Neutral** | No personality guidance; the model's honest assessment |
| 2 | **Pessimistic** | Worst-case scenario modelling |
| 3 | **Optimistic** | Best-case scenario modelling |
| 4 | **Blindsides** | Focus on low-probability but conceivable pivots |
| 5 | **Probabilistic** | Use probabilities and historical precedent for mathematically rigorous predictions |
| 6 | **Historical** | Predictions solely through the lens of historical actor behaviour in similar circumstances; deliberately ignores statistical weight of evidence to produce a differentiated response |

### 4. Summarisation

A summarisation subagent reads all six scenario outputs and produces an executive summary.

### 5. Report Construction

All outputs are assembled into a timestamped PDF:

1. Executive summary (from Step 4)
2. Raw outputs from each of the six scenario subagents (from Step 3)
