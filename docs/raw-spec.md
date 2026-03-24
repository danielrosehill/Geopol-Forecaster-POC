# Geopol Forecaster 


## Structure (For POC)

Focus area is fixed!

In this case: this geopolitical forecaster provides forecasts on the ongoing conflict between Iran, Israel and the US and is intended to allow the user to explore various ways in which the conflict can unfold based on various probability assessments and the potential movement of various actors. 

## Session Mgmt

A prediction run yesterday is of very limited value but there is no reason to discard the data / make the app ephemeral/browser-side only. 

So: each round of predictions is stored in a lightweight backend. 

## Step 1: State Gathering 

User starts a session. 

Step 1 = where is the event at right now? Timestamping: always UTC.

Method:

Groq + Gemini. Gemini 3.1 Lite if sufficient and search grounding is enabled. Groq fills in the gaps for near real-time info.

Orchestration: agent tasks the subagents: Please provide an update on the current situation regarding the Iran Israel War. Describe developments over the past windows: 3 hours, 6 hours, 12 hours, 24 hours.

Combined outputs are augmented with the foundational background context about the event (ground truth). 

Agent provides this task completion as Draft Ground Truth and presents to user.

The ground truth is written for AI agents. 

Approximately: This document describes the latest developments, accurate to {time} involving a military conflict between A and B. It is detailed and goes into sections. It does *not* offer any predictions and should aim to be as neutral as possible. This should be a detailed but bland account of the current position.

## Step 2: User Review

The user receives a text output and reviews it and corrects any errors and adds any details that the AI agents missed.

User confirms.

## Step 3: Scenario Modelling 

The corrected ground truth then gets sent to subagents.

Each subagent is tasked with predicting the conflict evolution over these timeframes: 24 hours, 1 week, 1 month, 1 year.

The subagents are:

1: Neutral: Receives no guidance as to personality. Just produces the model's honest assessment.

2: Pessimistic: Worst case scenario modelling. 

3: Optimistic: Best case scenario. 

4: Blindsides: Instructed to hone in on identifying potential pivots that may be less likely but which are conceivable.

5: Probabilistic: Instructed to use probabilities and historical precedent to attempt to make all predictions as mathematically rigorous as possible.

6: Historical angle: This subagent is instructed to disregard data and mathematics and make its predictions solely through the lens of history focusing on how actors have behaved in similar circumstances. Arguably this is a form of data so this agent should be instructed to *not* consider the "weight" of evidence so as to come up with a different response.

## Step 4: Summarisation

A subagent is instructed to read the previous subagent outputs and provide an overarching summary.

## Step 5: Report Construction

All the outputs are combined into a PDF with a timestamp. It leads with the exec summary from the summarisation agent and then presents the raw outputs from the previous subagents.





