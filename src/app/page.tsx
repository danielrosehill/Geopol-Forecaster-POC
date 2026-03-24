"use client";

import { useState, useCallback, useEffect } from "react";
import { LENSES } from "@/lib/types";

type Step = "idle" | "gathering" | "review" | "sitrep" | "forecasting" | "summarizing" | "done";

interface SessionEntry {
  id: string;
  createdAt: string;
  step: Step;
  groundTruth: string;
  sitrep: Record<string, string>;
  forecasts: Record<string, string>;
  summary: string;
}

const SITREP_SECTION_TITLES: Record<string, string> = {
  key_takeaways: "Key Takeaways",
  coalition_ops: "Coalition / US Operations",
  iranian_ops: "Iranian Offensive Operations",
  strikes: "Strike Activity & BDA",
  northern_front: "Northern Front",
  gulf_states: "Gulf States & Strait of Hormuz",
  military_technical: "Military & Technical",
  trajectory: "Strategic Trajectory",
  us_statements: "US Statements",
  israel_statements: "Israeli Statements",
  home_front: "Home Front",
  world_reaction: "International Reaction",
  osint_indicators: "OSINT Indicators",
  outlook: "12–24h Outlook",
};

function saveSession(session: SessionEntry) {
  return fetch("/api/sessions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
}

export default function Home() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("idle");
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [groundTruth, setGroundTruth] = useState("");
  const [sitrep, setSitrep] = useState<Record<string, string>>({});
  const [forecasts, setForecasts] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [activeLens, setActiveLens] = useState<string | null>(null);
  const [activeSitrepSection, setActiveSitrepSection] = useState<string | null>(null);

  // Load sessions from backend on mount
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: SessionEntry[]) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const persistAndUpdateList = useCallback(
    async (entry: SessionEntry) => {
      await saveSession(entry);
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === entry.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = entry;
          return updated;
        }
        return [entry, ...prev];
      });
    },
    []
  );

  const loadSession = useCallback((session: SessionEntry) => {
    setActiveSessionId(session.id);
    setSessionId(session.id);
    setCreatedAt(session.createdAt);
    setStep(session.step as Step);
    setGroundTruth(session.groundTruth);
    setSitrep(session.sitrep ?? {});
    setForecasts(session.forecasts);
    setSummary(session.summary);
    setError("");
    setActiveLens(null);
    setActiveSitrepSection(null);
  }, []);

  const startNewSession = useCallback(() => {
    const newId = crypto.randomUUID();
    const newCreatedAt = new Date().toISOString();
    setSessionId(newId);
    setCreatedAt(newCreatedAt);
    setActiveSessionId(newId);
    setStep("idle");
    setGroundTruth("");
    setSitrep({});
    setForecasts({});
    setSummary("");
    setError("");
    setActiveLens(null);
    setActiveSitrepSection(null);
  }, []);

  const startGathering = useCallback(async () => {
    setError("");
    setStep("gathering");
    setActiveSessionId(sessionId);

    const entry: SessionEntry = {
      id: sessionId, createdAt, step: "gathering",
      groundTruth: "", sitrep: {}, forecasts: {}, summary: "",
    };
    await persistAndUpdateList(entry);

    try {
      const res = await fetch("/api/gather", { method: "POST" });
      if (!res.ok) throw new Error(`Gather failed: ${res.statusText}`);
      const data = await res.json();
      setGroundTruth(data.groundTruth);
      setStep("review");
      await persistAndUpdateList({ ...entry, step: "review", groundTruth: data.groundTruth });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("idle");
    }
  }, [sessionId, createdAt, persistAndUpdateList]);

  const confirmGroundTruth = useCallback(async () => {
    setError("");
    setStep("sitrep");

    try {
      // Generate SITREP
      const sitrepRes = await fetch("/api/sitrep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groundTruth }),
      });
      if (!sitrepRes.ok) throw new Error(`SITREP generation failed: ${sitrepRes.statusText}`);
      const sitrepData = await sitrepRes.json();
      setSitrep(sitrepData.sitrep);

      // Forecast
      setStep("forecasting");
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groundTruth }),
      });
      if (!res.ok) throw new Error(`Forecast failed: ${res.statusText}`);
      const data = await res.json();
      setForecasts(data.forecasts);

      // Summarize
      setStep("summarizing");
      const sumRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forecasts: data.forecasts }),
      });
      if (!sumRes.ok) throw new Error(`Summary failed: ${sumRes.statusText}`);
      const sumData = await sumRes.json();
      setSummary(sumData.summary);
      setStep("done");

      // Persist completed session
      await persistAndUpdateList({
        id: sessionId, createdAt, step: "done",
        groundTruth, sitrep: sitrepData.sitrep,
        forecasts: data.forecasts, summary: sumData.summary,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("review");
    }
  }, [groundTruth, sessionId, createdAt, persistAndUpdateList]);

  const downloadPdf = useCallback(async () => {
    const res = await fetch("/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, createdAt, groundTruth, sitrep, forecasts, summary }),
    });
    if (!res.ok) {
      setError("PDF generation failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geopol-forecast-${sessionId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionId, createdAt, groundTruth, sitrep, forecasts, summary]);

  const STEP_LABELS = ["Gather", "Review", "SITREP", "Forecast", "Summarize", "Report"] as const;
  const STEP_MAP: Step[] = ["gathering", "review", "sitrep", "forecasting", "summarizing", "done"];

  return (
    <>
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 flex flex-col h-screen sticky top-0">
        <div className="px-4 py-4 border-b border-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-900">Sessions</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-xs text-zinc-400 px-4 py-6 text-center">Loading...</p>
          )}
          {!loading && sessions.length === 0 && (
            <p className="text-xs text-zinc-400 px-4 py-6 text-center">No sessions yet</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSession(s)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-100 transition-colors ${
                activeSessionId === s.id
                  ? "bg-white border-l-2 border-l-blue-500"
                  : "hover:bg-zinc-100"
              }`}
            >
              <p className="text-xs font-mono text-zinc-500 truncate">{s.id.slice(0, 8)}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {new Date(s.createdAt).toLocaleString()}
              </p>
              <span className={`inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                s.step === "done"
                  ? "bg-green-100 text-green-700"
                  : s.step === "idle"
                    ? "bg-zinc-100 text-zinc-500"
                    : "bg-blue-100 text-blue-700"
              }`}>
                {s.step === "idle" ? "new" : s.step === "done" ? "complete" : s.step}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-zinc-200">
          <button
            onClick={startNewSession}
            className="w-full bg-zinc-900 text-white text-sm px-3 py-2 rounded font-medium hover:bg-zinc-800 transition-colors"
          >
            + New Session
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-8 py-8 gap-6 min-h-screen">
        {/* Header */}
        <div className="border-b border-zinc-200 pb-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Geopol Forecaster</h1>
          <p className="text-sm text-zinc-500 mt-1">Iran–Israel–US Conflict Assessment</p>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Session {sessionId.slice(0, 8)} &middot; {new Date(createdAt).toUTCString()}
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 text-xs font-mono flex-wrap">
          {STEP_LABELS.map((label, i) => {
            const idx = STEP_MAP.indexOf(step);
            const isActive = i === idx;
            const isDone = i < idx;
            return (
              <div
                key={label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded ${
                  isActive
                    ? "bg-zinc-200 text-zinc-900"
                    : isDone
                      ? "bg-zinc-100 text-zinc-600"
                      : "bg-zinc-50 text-zinc-400 border border-zinc-200"
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    isActive ? "bg-blue-500 animate-pulse" : isDone ? "bg-green-500" : "bg-zinc-300"
                  }`}
                />
                {label}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Step: Idle */}
        {step === "idle" && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <p className="text-zinc-500 text-center max-w-md">
              Start a new forecasting session. The system will gather current intelligence,
              generate a structured SITREP, then produce scenario forecasts from six analytical lenses.
            </p>
            <button
              onClick={startGathering}
              className="bg-zinc-900 text-white px-6 py-2.5 rounded font-medium text-sm hover:bg-zinc-800 transition-colors"
            >
              Start Session
            </button>
          </div>
        )}

        {/* Step: Gathering */}
        {step === "gathering" && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-zinc-500 text-sm">Gathering intelligence from Gemini and Grok...</p>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Draft Ground Truth</h2>
              <span className="text-xs text-zinc-400">Edit as needed, then confirm</span>
            </div>
            <textarea
              value={groundTruth}
              onChange={(e) => setGroundTruth(e.target.value)}
              className="w-full h-[500px] bg-white border border-zinc-300 rounded p-4 text-sm font-mono text-zinc-800 resize-y focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setStep("idle"); setGroundTruth(""); }}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={confirmGroundTruth}
                className="bg-zinc-900 text-white px-6 py-2 rounded font-medium text-sm hover:bg-zinc-800 transition-colors"
              >
                Confirm &amp; Generate
              </button>
            </div>
          </div>
        )}

        {/* Step: SITREP generation */}
        {step === "sitrep" && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-zinc-500 text-sm">Generating structured SITREP...</p>
          </div>
        )}

        {/* Step: Forecasting / Summarizing */}
        {(step === "forecasting" || step === "summarizing") && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <p className="text-zinc-500 text-sm">
              {step === "forecasting"
                ? "Running 6 scenario subagents across 4 timeframes..."
                : "Generating executive summary..."}
            </p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col gap-6">
            {/* Summary */}
            <section>
              <h2 className="text-lg font-semibold mb-3 text-zinc-900">Executive Summary</h2>
              <div className="bg-zinc-50 border border-zinc-200 rounded p-4 text-sm text-zinc-700 whitespace-pre-wrap">
                {summary}
              </div>
            </section>

            {/* SITREP */}
            {Object.keys(sitrep).length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3 text-zinc-900">Situation Report</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(SITREP_SECTION_TITLES).map(([key, title]) => {
                    if (!sitrep[key]) return null;
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveSitrepSection(activeSitrepSection === key ? null : key)}
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                          activeSitrepSection === key
                            ? "bg-zinc-200 text-zinc-900"
                            : "bg-white border border-zinc-300 text-zinc-500 hover:text-zinc-700"
                        }`}
                      >
                        {title}
                      </button>
                    );
                  })}
                </div>
                {activeSitrepSection && sitrep[activeSitrepSection] && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded p-4 text-sm text-zinc-700 whitespace-pre-wrap">
                    {sitrep[activeSitrepSection]}
                  </div>
                )}
                {!activeSitrepSection && (
                  <p className="text-zinc-400 text-sm">Select a section to view.</p>
                )}
              </section>
            )}

            {/* Forecasts */}
            <section>
              <h2 className="text-lg font-semibold mb-3 text-zinc-900">Scenario Forecasts</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {LENSES.map((lens) => (
                  <button
                    key={lens.id}
                    onClick={() => setActiveLens(activeLens === lens.id ? null : lens.id)}
                    className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                      activeLens === lens.id
                        ? "bg-zinc-200 text-zinc-900"
                        : "bg-white border border-zinc-300 text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    {lens.name}
                  </button>
                ))}
              </div>
              {activeLens && forecasts[activeLens] && (
                <div className="bg-zinc-50 border border-zinc-200 rounded p-4 text-sm text-zinc-700 whitespace-pre-wrap">
                  {forecasts[activeLens]}
                </div>
              )}
              {!activeLens && (
                <p className="text-zinc-400 text-sm">Select a lens to view its forecast.</p>
              )}
            </section>

            {/* Actions */}
            <div className="flex gap-3 justify-end border-t border-zinc-200 pt-4">
              <button
                onClick={startNewSession}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                New Session
              </button>
              <button
                onClick={downloadPdf}
                className="bg-zinc-900 text-white px-6 py-2 rounded font-medium text-sm hover:bg-zinc-800 transition-colors"
              >
                Download PDF Report
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Spinner() {
  return (
    <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
  );
}
