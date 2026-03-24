import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "geopol.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    // Ensure directory exists
    const dir = path.dirname(DB_PATH);
    const fs = require("fs");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        step TEXT NOT NULL DEFAULT 'idle',
        ground_truth TEXT,
        sitrep TEXT,
        forecasts TEXT,
        summary TEXT,
        updated_at TEXT NOT NULL
      )
    `);

    // Migration: add sitrep column if missing (for existing DBs)
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    if (!cols.find((c) => c.name === "sitrep")) {
      db.exec("ALTER TABLE sessions ADD COLUMN sitrep TEXT");
    }
  }
  return db;
}

export interface SessionRow {
  id: string;
  created_at: string;
  step: string;
  ground_truth: string | null;
  sitrep: string | null;
  forecasts: string | null;
  summary: string | null;
  updated_at: string;
}

export function listSessions(): SessionRow[] {
  return getDb()
    .prepare("SELECT * FROM sessions ORDER BY created_at DESC")
    .all() as SessionRow[];
}

export function getSession(id: string): SessionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
}

export function upsertSession(session: {
  id: string;
  createdAt: string;
  step: string;
  groundTruth: string | null;
  sitrep: string | null;
  forecasts: Record<string, string> | null;
  summary: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO sessions (id, created_at, step, ground_truth, sitrep, forecasts, summary, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         step = excluded.step,
         ground_truth = excluded.ground_truth,
         sitrep = excluded.sitrep,
         forecasts = excluded.forecasts,
         summary = excluded.summary,
         updated_at = excluded.updated_at`
    )
    .run(
      session.id,
      session.createdAt,
      session.step,
      session.groundTruth,
      session.sitrep,
      session.forecasts ? JSON.stringify(session.forecasts) : null,
      session.summary,
      new Date().toISOString()
    );
}

export function deleteSession(id: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
}
