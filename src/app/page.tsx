"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LENSES, TIMEFRAMES } from "@/lib/types";
import type { LensForecast, TimeframeId } from "@/lib/types";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Step =
  | "idle"
  | "gathering"
  | "review"
  | "sitrep"
  | "sitrep_review"
  | "forecasting"
  | "summarizing"
  | "done";

interface SessionEntry {
  id: string;
  createdAt: string;
  step: Step;
  groundTruth: string;
  sitrep: Record<string, string>;
  forecasts: Record<string, LensForecast>;
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
  outlook: "12-24h Outlook",
};

const SITREP_SECTION_ORDER = Object.keys(SITREP_SECTION_TITLES);

/** Agent model assignments (mirrors forecast/route.ts logic) */
const AGENT_MODELS = ["google/gemini-3.1-flash-lite-preview", "x-ai/grok-4.1-fast"] as const;
const AGENT_LABELS = ["Gemini 3.1 Flash Lite", "Grok 4.1 Fast"] as const;
const LENS_AGENTS = Object.fromEntries(
  LENSES.map((lens, i) => [lens.id, { model: AGENT_MODELS[i % 2], label: AGENT_LABELS[i % 2] }])
);

function saveSession(session: SessionEntry) {
  return fetch("/api/sessions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
}

/** Normalize forecast data: old sessions store plain strings, new ones store {full, timeframes} */
function normalizeForecast(val: unknown): LensForecast {
  if (typeof val === "string") return { full: val, timeframes: {} };
  if (val && typeof val === "object" && "full" in val) return val as LensForecast;
  return { full: "", timeframes: {} };
}

function normalizeForecasts(raw: Record<string, unknown>): Record<string, LensForecast> {
  const out: Record<string, LensForecast> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = normalizeForecast(v);
  return out;
}

/* ── Markdown prose styles ── */
const proseClasses =
  "prose prose-sm prose-zinc max-w-none prose-headings:text-zinc-900 prose-p:text-zinc-700 prose-strong:text-zinc-800 prose-li:text-zinc-700 prose-a:text-blue-600";

function MarkdownView({ content }: { content: string }) {
  return (
    <div className={`bg-zinc-50/80 border border-zinc-200 rounded-lg p-5 ${proseClasses}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/* ── Toast System ── */
interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-slide-up ${
            t.type === "success"
              ? "bg-emerald-900 text-emerald-100 border border-emerald-700"
              : t.type === "error"
                ? "bg-red-900 text-red-100 border border-red-700"
                : "bg-zinc-800 text-zinc-100 border border-zinc-600"
          }`}
        >
          <span>
            {t.type === "success" ? "\u2713" : t.type === "error" ? "\u2717" : "\u2139"}
          </span>
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-60 hover:opacity-100 text-xs">
            \u2715
          </button>
        </div>
      ))}
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);
  return { toasts, show, dismiss };
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
  const [forecasts, setForecasts] = useState<Record<string, LensForecast>>({});
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [activeLens, setActiveLens] = useState<string | null>(null);
  const [activeSitrepSection, setActiveSitrepSection] = useState<string | null>(null);
  const [editingSitrepSection, setEditingSitrepSection] = useState<string | null>(null);
  const [doneTab, setDoneTab] = useState<"summary" | "sitrep" | "forecasts" | "analysis">("summary");
  const [forecastView, setForecastView] = useState<"by-lens" | "by-timeframe">("by-timeframe");
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeId>("24h");
  const [downloadingLens, setDownloadingLens] = useState<string | null>(null);

  const { toasts, show: showToast, dismiss: dismissToast } = useToasts();

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
    setForecasts(normalizeForecasts(session.forecasts ?? {}));
    setSummary(session.summary);
    setError("");
    setActiveLens(null);
    setActiveSitrepSection(null);
    setEditingSitrepSection(null);
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
    setEditingSitrepSection(null);
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
      showToast("Intelligence gathered from 2 sources", "success");
      await persistAndUpdateList({ ...entry, step: "review", groundTruth: data.groundTruth });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      showToast("Intelligence gathering failed", "error");
      setStep("idle");
    }
  }, [sessionId, createdAt, persistAndUpdateList, showToast]);

  /* Confirm ground truth -> generate SITREP -> pause at sitrep_review */
  const confirmGroundTruth = useCallback(async () => {
    setError("");
    setStep("sitrep");

    try {
      const sitrepRes = await fetch("/api/sitrep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groundTruth }),
      });
      if (!sitrepRes.ok) throw new Error(`SITREP generation failed: ${sitrepRes.statusText}`);
      const sitrepData = await sitrepRes.json();
      setSitrep(sitrepData.sitrep);
      setStep("sitrep_review");
      showToast("SITREP generated — review and edit sections", "success");

      const firstKey = SITREP_SECTION_ORDER.find((k) => sitrepData.sitrep[k]);
      if (firstKey) setEditingSitrepSection(firstKey);

      await persistAndUpdateList({
        id: sessionId, createdAt, step: "sitrep_review",
        groundTruth, sitrep: sitrepData.sitrep, forecasts: {}, summary: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      showToast("SITREP generation failed", "error");
      setStep("review");
    }
  }, [groundTruth, sessionId, createdAt, persistAndUpdateList, showToast]);

  /* Confirm SITREP -> forecast -> summarize -> done */
  const confirmSitrep = useCallback(async () => {
    setError("");

    try {
      setStep("forecasting");
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groundTruth }),
      });
      if (!res.ok) throw new Error(`Forecast failed: ${res.statusText}`);
      const data = await res.json();
      const normalizedF = normalizeForecasts(data.forecasts);
      setForecasts(normalizedF);
      showToast("6 forecast agents completed", "success");

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
      showToast("Analysis complete — report ready", "success");

      await persistAndUpdateList({
        id: sessionId, createdAt, step: "done",
        groundTruth, sitrep, forecasts: normalizedF, summary: sumData.summary,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      showToast("Forecast pipeline failed", "error");
      setStep("sitrep_review");
    }
  }, [groundTruth, sitrep, sessionId, createdAt, persistAndUpdateList, showToast]);

  const downloadPdf = useCallback(async () => {
    showToast("Generating full report PDF...", "info");
    const res = await fetch("/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, createdAt, groundTruth, sitrep, forecasts, summary }),
    });
    if (!res.ok) {
      showToast("PDF generation failed", "error");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date(createdAt).toISOString().slice(0, 16).replace(/[T:]/g, "-");
    a.download = `geopol-full-report-${ts}-${sessionId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Full report downloaded", "success");
  }, [sessionId, createdAt, groundTruth, sitrep, forecasts, summary, showToast]);

  const downloadLensPdf = useCallback(async (lensId: string) => {
    const lens = LENSES.find((l) => l.id === lensId);
    if (!lens || !forecasts[lensId]) return;
    setDownloadingLens(lensId);
    showToast(`Generating ${lens.name} PDF...`, "info");

    try {
      const res = await fetch("/api/generate-lens-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lensId,
          lensName: lens.name,
          agentModel: LENS_AGENTS[lensId]?.label ?? "Unknown",
          content: forecasts[lensId].full,
          sessionId,
          createdAt,
        }),
      });
      if (!res.ok) {
        showToast(`Failed to generate ${lens.name} PDF`, "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition");
      const filenameMatch = cd?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] ?? `${lensId}-forecast.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${lens.name} forecast downloaded`, "success");
    } catch {
      showToast(`Failed to generate ${lens.name} PDF`, "error");
    } finally {
      setDownloadingLens(null);
    }
  }, [forecasts, sessionId, createdAt, showToast]);

  const updateSitrepSection = useCallback(
    (key: string, value: string) => {
      setSitrep((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const STEP_LABELS = ["Gather", "Review", "SITREP", "Edit SITREP", "Forecast", "Summarize", "Report"] as const;
  const STEP_MAP: Step[] = ["gathering", "review", "sitrep", "sitrep_review", "forecasting", "summarizing", "done"];

  /** Check if any lens has structured timeframe data */
  const hasTimeframeData = Object.values(forecasts).some(
    (f) => f.timeframes && Object.keys(f.timeframes).length > 0 && !f.timeframes["_full"]
  );

  return (
    <>
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 flex flex-col h-screen sticky top-0">
        <div className="px-4 py-4 border-b border-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">Sessions</h2>
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
                  ? "bg-emerald-100 text-emerald-700"
                  : s.step === "idle"
                    ? "bg-zinc-100 text-zinc-500"
                    : "bg-blue-50 text-blue-600"
              }`}>
                {s.step === "idle" ? "new" : s.step === "done" ? "complete" : s.step}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-zinc-200">
          <button
            onClick={startNewSession}
            className="w-full bg-zinc-900 text-white text-sm px-3 py-2 rounded-lg font-medium hover:bg-zinc-800 transition-colors"
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
          <p className="text-sm text-zinc-500 mt-1">Iran-Israel-US Conflict Assessment</p>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Session {sessionId.slice(0, 8)} &middot; {new Date(createdAt).toUTCString()}
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 text-xs font-mono flex-wrap">
          {STEP_LABELS.map((label, i) => {
            const idx = STEP_MAP.indexOf(step);
            const isActive = i === idx;
            const isDone = i < idx;
            return (
              <div
                key={label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-sm"
                    : isDone
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-zinc-50 text-zinc-400 border border-zinc-200"
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    isActive ? "bg-blue-400 animate-pulse" : isDone ? "bg-emerald-500" : "bg-zinc-300"
                  }`}
                />
                {label}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <span className="text-red-400">{"\u26A0"}</span>
            {error}
          </div>
        )}

        {/* Step: Idle */}
        {step === "idle" && (
          <div className="flex flex-col items-center justify-center gap-5 py-20">
            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 text-xl">
              {"\u25C9"}
            </div>
            <p className="text-zinc-500 text-center max-w-md leading-relaxed">
              Start a new forecasting session. The system will gather current intelligence,
              generate a structured SITREP, then produce scenario forecasts from six analytical lenses.
            </p>
            <button
              onClick={startGathering}
              className="bg-zinc-900 text-white px-8 py-3 rounded-lg font-medium text-sm hover:bg-zinc-800 transition-colors shadow-sm"
            >
              Start Session
            </button>
          </div>
        )}

        {/* Step: Gathering */}
        {step === "gathering" && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Spinner />
            <div className="text-center">
              <p className="text-zinc-700 text-sm font-medium">Gathering intelligence</p>
              <p className="text-zinc-400 text-xs mt-1">Querying Gemini (search-grounded) and Grok...</p>
            </div>
          </div>
        )}

        {/* Step: Review Ground Truth */}
        {step === "review" && (
          <div className="flex flex-col gap-4" data-color-mode="light">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Draft Ground Truth</h2>
              <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded">Edit as needed, then confirm</span>
            </div>
            <div className="border border-zinc-300 rounded-lg overflow-hidden shadow-sm">
              <MDEditor
                value={groundTruth}
                onChange={(val) => setGroundTruth(val ?? "")}
                height={500}
                preview="live"
                visibleDragbar={false}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setStep("idle"); setGroundTruth(""); }}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={confirmGroundTruth}
                className="bg-zinc-900 text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-zinc-800 transition-colors shadow-sm"
              >
                Confirm Ground Truth
              </button>
            </div>
          </div>
        )}

        {/* Step: SITREP generation (loading) */}
        {step === "sitrep" && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Spinner />
            <div className="text-center">
              <p className="text-zinc-700 text-sm font-medium">Generating SITREP</p>
              <p className="text-zinc-400 text-xs mt-1">Structuring 14-section situation report...</p>
            </div>
          </div>
        )}

        {/* Step: SITREP Review & Edit */}
        {step === "sitrep_review" && (
          <div className="flex flex-col gap-4" data-color-mode="light">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Review Situation Report</h2>
              <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded">Edit sections as needed</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {SITREP_SECTION_ORDER.map((key) => {
                if (!sitrep[key]) return null;
                const isActive = editingSitrepSection === key;
                return (
                  <button
                    key={key}
                    onClick={() => setEditingSitrepSection(isActive ? null : key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                      isActive
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "bg-white border border-zinc-300 text-zinc-500 hover:text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {SITREP_SECTION_TITLES[key] ?? key}
                  </button>
                );
              })}
            </div>

            {editingSitrepSection && sitrep[editingSitrepSection] !== undefined && (
              <div className="border border-zinc-300 rounded-lg overflow-hidden shadow-sm">
                <MDEditor
                  value={sitrep[editingSitrepSection]}
                  onChange={(val) => updateSitrepSection(editingSitrepSection, val ?? "")}
                  height={400}
                  preview="live"
                  visibleDragbar={false}
                />
              </div>
            )}

            {!editingSitrepSection && (
              <p className="text-zinc-400 text-sm py-8 text-center">Select a section above to review and edit.</p>
            )}

            <div className="flex gap-3 justify-end border-t border-zinc-200 pt-4">
              <button
                onClick={() => { setStep("review"); }}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Back to Ground Truth
              </button>
              <button
                onClick={confirmSitrep}
                className="bg-zinc-900 text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-zinc-800 transition-colors shadow-sm"
              >
                Approve &amp; Forecast
              </button>
            </div>
          </div>
        )}

        {/* Step: Forecasting / Summarizing */}
        {(step === "forecasting" || step === "summarizing") && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Spinner />
            <div className="text-center">
              <p className="text-zinc-700 text-sm font-medium">
                {step === "forecasting" ? "Running forecast agents" : "Generating executive summary"}
              </p>
              <p className="text-zinc-400 text-xs mt-1">
                {step === "forecasting"
                  ? "6 agents analyzing across 4 timeframes..."
                  : "Synthesizing cross-lens consensus..."}
              </p>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col gap-6">
            {/* Section tabs */}
            <div className="flex gap-1 border-b border-zinc-200 pb-0">
              {(["summary", "sitrep", "forecasts", "analysis"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDoneTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                    doneTab === tab
                      ? "border-zinc-900 text-zinc-900"
                      : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {tab === "summary" ? "Executive Summary" : tab === "sitrep" ? "Situation Report" : tab === "forecasts" ? "Scenario Forecasts" : "Run Analysis"}
                </button>
              ))}
            </div>

            {/* Tab: Executive Summary */}
            {doneTab === "summary" && (
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-lg font-semibold text-zinc-900">Executive Summary</h2>
                  <AgentBadge label="Grok 4.1 Fast" />
                </div>
                <MarkdownView content={summary} />
              </section>
            )}

            {/* Tab: SITREP */}
            {doneTab === "sitrep" && Object.keys(sitrep).length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-lg font-semibold text-zinc-900">Situation Report</h2>
                  <AgentBadge label="Gemini 3.1 Flash Lite" />
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(SITREP_SECTION_TITLES).map(([key, title]) => {
                    if (!sitrep[key]) return null;
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveSitrepSection(activeSitrepSection === key ? null : key)}
                        className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                          activeSitrepSection === key
                            ? "bg-zinc-900 text-white shadow-sm"
                            : "bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-400"
                        }`}
                      >
                        {title}
                      </button>
                    );
                  })}
                </div>
                {activeSitrepSection && sitrep[activeSitrepSection] && (
                  <MarkdownView content={sitrep[activeSitrepSection]} />
                )}
                {!activeSitrepSection && (
                  <p className="text-zinc-400 text-sm py-4">Select a section to view.</p>
                )}
              </section>
            )}

            {/* Tab: Scenario Forecasts */}
            {doneTab === "forecasts" && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-zinc-900">Scenario Forecasts</h2>
                  {hasTimeframeData && (
                    <div className="flex bg-zinc-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setForecastView("by-timeframe")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          forecastView === "by-timeframe"
                            ? "bg-white text-zinc-900 shadow-sm"
                            : "text-zinc-500 hover:text-zinc-700"
                        }`}
                      >
                        By Timeframe
                      </button>
                      <button
                        onClick={() => setForecastView("by-lens")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          forecastView === "by-lens"
                            ? "bg-white text-zinc-900 shadow-sm"
                            : "text-zinc-500 hover:text-zinc-700"
                        }`}
                      >
                        By Lens
                      </button>
                    </div>
                  )}
                </div>

                {/* By-Timeframe View */}
                {forecastView === "by-timeframe" && hasTimeframeData && (
                  <>
                    <div className="flex gap-2 mb-5">
                      {TIMEFRAMES.map((tf) => (
                        <button
                          key={tf.id}
                          onClick={() => setActiveTimeframe(tf.id)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTimeframe === tf.id
                              ? "bg-zinc-900 text-white shadow-sm"
                              : "bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-400"
                          }`}
                        >
                          {tf.short}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-4">
                      {LENSES.map((lens) => {
                        const forecast = forecasts[lens.id];
                        if (!forecast) return null;
                        const tfContent = forecast.timeframes[activeTimeframe];
                        if (!tfContent) return null;
                        return (
                          <div key={lens.id} className="border border-zinc-200 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                              <div className="flex items-center gap-2.5">
                                <LensIcon lensId={lens.id} />
                                <span className="text-sm font-semibold text-zinc-800">{lens.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <AgentBadge label={LENS_AGENTS[lens.id]?.label ?? ""} />
                                <button
                                  onClick={() => downloadLensPdf(lens.id)}
                                  disabled={downloadingLens === lens.id}
                                  className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors px-2 py-1 rounded hover:bg-zinc-100 disabled:opacity-50"
                                  title={`Download ${lens.name} PDF`}
                                >
                                  {downloadingLens === lens.id ? "\u23F3" : "\u2193 PDF"}
                                </button>
                              </div>
                            </div>
                            <div className="p-4">
                              <MarkdownView content={tfContent} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* By-Lens View (also used as fallback when no structured timeframe data) */}
                {(forecastView === "by-lens" || !hasTimeframeData) && (
                  <>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {LENSES.map((lens) => (
                        <button
                          key={lens.id}
                          onClick={() => setActiveLens(activeLens === lens.id ? null : lens.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                            activeLens === lens.id
                              ? "bg-zinc-900 text-white shadow-sm"
                              : "bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-400"
                          }`}
                        >
                          <LensIcon lensId={lens.id} />
                          {lens.name}
                        </button>
                      ))}
                    </div>
                    {activeLens && forecasts[activeLens] && (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <AgentBadge label={LENS_AGENTS[activeLens]?.label ?? ""} />
                          <button
                            onClick={() => downloadLensPdf(activeLens)}
                            disabled={downloadingLens === activeLens}
                            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors px-2 py-1 rounded hover:bg-zinc-100 disabled:opacity-50"
                          >
                            {downloadingLens === activeLens ? "\u23F3" : "\u2193 Download PDF"}
                          </button>
                        </div>
                        <MarkdownView content={forecasts[activeLens].full} />
                      </>
                    )}
                    {!activeLens && (
                      <p className="text-zinc-400 text-sm py-4">Select a lens to view its forecast.</p>
                    )}
                  </>
                )}
              </section>
            )}

            {/* Tab: Run Analysis */}
            {doneTab === "analysis" && (
              <section>
                <h2 className="text-lg font-semibold mb-4 text-zinc-900">Run Analysis</h2>

                <div className="border border-zinc-200 rounded-lg overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <tbody>
                      {[
                        ["Session ID", sessionId.slice(0, 8)],
                        ["Timestamp", new Date(createdAt).toUTCString()],
                        ["Ground Truth Sources", "Gemini 3.1 Flash Lite (search-grounded) + Grok 4.1 Fast"],
                        ["SITREP Agent", "Gemini 3.1 Flash Lite (via OpenRouter)"],
                        ["Forecast Agents", `${LENSES.length} parallel lenses`],
                        ["Summary Agent", "Grok 4.1 Fast (via OpenRouter)"],
                      ].map(([label, value]) => (
                        <tr key={label} className="border-b border-zinc-100 last:border-0">
                          <td className="px-4 py-2.5 font-medium text-zinc-700 bg-zinc-50 w-48">{label}</td>
                          <td className="px-4 py-2.5 text-zinc-600 font-mono text-xs">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="text-sm font-semibold text-zinc-700 mb-3">Forecast Agent Assignments</h3>
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {LENSES.map((lens) => {
                    const agent = LENS_AGENTS[lens.id];
                    const hasOutput = !!forecasts[lens.id]?.full;
                    return (
                      <div
                        key={lens.id}
                        className="flex items-center justify-between border border-zinc-200 rounded-lg px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${hasOutput ? "bg-emerald-500" : "bg-red-400"}`} />
                          <LensIcon lensId={lens.id} />
                          <span className="text-sm font-medium text-zinc-700">{lens.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400 font-mono">{agent?.label}</span>
                          {hasOutput && (
                            <button
                              onClick={() => downloadLensPdf(lens.id)}
                              disabled={downloadingLens === lens.id}
                              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors px-1.5 py-0.5 rounded hover:bg-zinc-100 disabled:opacity-50"
                              title={`Download ${lens.name} PDF`}
                            >
                              {downloadingLens === lens.id ? "\u23F3" : "\u2193"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <h3 className="text-sm font-semibold text-zinc-700 mb-3">Quick Explore</h3>
                <div className="space-y-3">
                  {LENSES.map((lens) => {
                    if (!forecasts[lens.id]?.full) return null;
                    return (
                      <details key={lens.id} className="border border-zinc-200 rounded-lg group">
                        <summary className="px-4 py-2.5 cursor-pointer flex items-center justify-between text-sm font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 transition-colors rounded-lg">
                          <div className="flex items-center gap-2">
                            <LensIcon lensId={lens.id} />
                            <span>{lens.name} Lens</span>
                          </div>
                          <span className="text-xs text-zinc-400 font-mono">{LENS_AGENTS[lens.id]?.label}</span>
                        </summary>
                        <div className="p-4 border-t border-zinc-100">
                          <MarkdownView content={forecasts[lens.id].full} />
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            )}

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
                className="bg-zinc-900 text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-zinc-800 transition-colors shadow-sm"
              >
                Download Full Report
              </button>
            </div>
          </div>
        )}
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

/* ── Small UI Components ── */

function Spinner() {
  return (
    <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin" />
  );
}

function AgentBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded font-mono tracking-tight">
      {label}
    </span>
  );
}

const LENS_ICONS: Record<string, string> = {
  neutral: "\u2696",      // scales
  pessimistic: "\u26A0",  // warning
  optimistic: "\u2600",   // sun
  blindsides: "\u26A1",   // lightning
  probabilistic: "\u2684", // die
  historical: "\u231B",   // hourglass
};

function LensIcon({ lensId }: { lensId: string }) {
  return (
    <span className="text-xs opacity-60" title={lensId}>
      {LENS_ICONS[lensId] ?? "\u25CF"}
    </span>
  );
}
