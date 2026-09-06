import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import type {
  EstimateRange,
  Recommendation,
  SessionHistoryItem,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import type { TaskAnalysis } from "./engine";
import type { PilotRuntimeSettings } from "./settings";

interface ResourcePrediction {
  tokenEstimate: EstimateRange;
  costEstimate: EstimateRange;
}

export interface PersistedSessionInput {
  id: string;
  provider: string;
  startedAt: string;
  endedAt: string;
  updatedAt: string;
  cwd?: string;
  projectDir?: string;
  repository?: string;
  project: string;
  branch?: string;
  prompt?: string;
  displayTask: string;
  modelId?: string;
  modelName?: string;
  modifiedFiles: number;
  contextUsed?: number;
  contextLimit?: number;
  sessionCost?: number;
  contextRisk: string;
  unsupportedFields: string[];
  analysis: TaskAnalysis;
  prediction: ResourcePrediction;
  recommendation: Recommendation;
}

export interface PersistedClaudeSession {
  id: string;
  startedAt: string;
  updatedAt: string;
  endedAt: string;
  cwd?: string;
  projectDir?: string;
  repository?: string;
  project?: string;
  branch?: string;
  prompt?: string;
  modelId?: string;
  modelName?: string;
  contextUsed?: number;
  contextLimit?: number;
  sessionCost?: number;
  modifiedFiles: number;
}

interface SettingsRow {
  provider: string;
  port: number;
  context_warning: number;
  context_critical: number;
  switch_threshold: number;
  telemetry: number;
  mock_mode: number;
}

interface SessionHistoryRow {
  id: string;
  date: string;
  project: string;
  task: string;
  model: string | null;
  actual_tokens: number | null;
  predicted_min: number;
  predicted_max: number;
  predicted_confidence: number;
  cost: number | null;
  complexity: number;
  recommendation: string;
  unsupported_fields: string;
}

interface SessionStateRow {
  id: string;
  started_at: string;
  updated_at: string;
  ended_at: string;
  cwd: string | null;
  project_dir: string | null;
  repository: string | null;
  project: string | null;
  branch: string | null;
  prompt: string | null;
  model_id: string | null;
  model_name: string | null;
  context_used: number | null;
  context_limit: number | null;
  session_cost: number | null;
  modified_files: number;
}

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL,
        port INTEGER NOT NULL,
        context_warning INTEGER NOT NULL,
        context_critical INTEGER NOT NULL,
        switch_threshold INTEGER NOT NULL,
        telemetry INTEGER NOT NULL CHECK (telemetry IN (0, 1)),
        mock_mode INTEGER NOT NULL CHECK (mock_mode IN (0, 1)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        repository TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        cwd TEXT,
        project_dir TEXT,
        branch TEXT,
        model_id TEXT,
        model_name TEXT,
        modified_files INTEGER NOT NULL,
        unsupported_fields TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX sessions_ended_at_idx ON sessions(ended_at DESC);

      CREATE TABLE tasks (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        prompt TEXT,
        display_task TEXT NOT NULL,
        task_type TEXT NOT NULL,
        complexity_score INTEGER NOT NULL,
        complexity_level TEXT NOT NULL,
        expected_files INTEGER NOT NULL,
        expected_tool_calls INTEGER NOT NULL,
        reasoning_level TEXT NOT NULL
      );

      CREATE TABLE predictions (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        token_min REAL NOT NULL,
        token_max REAL NOT NULL,
        token_confidence INTEGER NOT NULL,
        cost_min REAL NOT NULL,
        cost_max REAL NOT NULL,
        cost_confidence INTEGER NOT NULL
      );

      CREATE TABLE recommendations (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        title TEXT NOT NULL,
        reason TEXT NOT NULL,
        current_fit INTEGER NOT NULL,
        recommended_fit INTEGER NOT NULL,
        recommended_model TEXT
      );

      CREATE TABLE usage (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        context_used INTEGER,
        context_limit INTEGER,
        session_cost REAL,
        context_risk TEXT NOT NULL
      );
    `,
  },
] as const;

let database: Database.Database | undefined;

function workspaceRoot(): string {
  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

export function modelPilotDataDirectory(): string {
  const configured = process.env["MODEL_PILOT_DATA_DIR"];
  return configured
    ? resolve(configured)
    : join(workspaceRoot(), ".model-pilot", "data");
}

export function modelPilotDatabasePath(): string {
  return join(modelPilotDataDirectory(), "model-pilot.sqlite");
}

function configure(db: Database.Database) {
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const appliedVersions = (
    db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as
      Array<{ version: number }>
  ).map((row) => row.version);
  const knownVersions = migrations.map((migration) => migration.version);
  const invalidVersion = appliedVersions.find(
    (version, index) => version !== knownVersions[index],
  );
  if (invalidVersion !== undefined || appliedVersions.length > knownVersions.length) {
    throw new Error(
      `Unsupported Model Pilot database migration history: ${appliedVersions.join(", ") || "empty"}`,
    );
  }
  const applied = new Set(appliedVersions);

  const applyMigration = db.transaction((version: number, sql: string) => {
    db.exec(sql);
    db.prepare(
      "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
    ).run(version, new Date().toISOString());
  });

  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      applyMigration(migration.version, migration.sql);
    }
  }
}

function isCorruption(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return code === "SQLITE_CORRUPT" ||
    code === "SQLITE_NOTADB" ||
    message.includes("database disk image is malformed") ||
    message.includes("file is not a database");
}

function retainCorruptDatabase(path: string): string[] {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const moved: string[] = [];
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const source = `${path}${suffix}`;
    if (!existsSync(source)) continue;
    const destination = `${path}.corrupt-${timestamp}${suffix}`;
    renameSync(source, destination);
    moved.push(destination);
  }
  return moved;
}

function openDatabase(): Database.Database {
  const path = modelPilotDatabasePath();
  mkdirSync(dirname(path), { recursive: true });

  let db: Database.Database | undefined;
  try {
    db = new Database(path);
    configure(db);
    migrate(db);
    return db;
  } catch (error) {
    db?.close();
    if (!isCorruption(error)) throw error;

    const retained = retainCorruptDatabase(path);
    logger.error(
      { err: error, retained },
      "Model Pilot retained a corrupt SQLite database and created a fresh one",
    );
    const replacement = new Database(path);
    configure(replacement);
    migrate(replacement);
    return replacement;
  }
}

function db(): Database.Database {
  database ??= openDatabase();
  return database;
}

function parseUnsupportedFields(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function loadSettings(defaults: PilotRuntimeSettings): PilotRuntimeSettings {
  const connection = db();
  const row = connection.prepare(
    `SELECT provider, port, context_warning, context_critical,
            switch_threshold, telemetry, mock_mode
       FROM settings
      WHERE id = 1`,
  ).get() as SettingsRow | undefined;
  if (row) {
    return {
      provider: row.provider,
      port: row.port,
      contextWarning: row.context_warning,
      contextCritical: row.context_critical,
      switchThreshold: row.switch_threshold,
      telemetry: Boolean(row.telemetry),
      mockMode: Boolean(row.mock_mode),
    };
  }
  saveSettings(defaults);
  return defaults;
}

export function saveSettings(settings: PilotRuntimeSettings): void {
  db().prepare(`
    INSERT INTO settings (
      id, provider, port, context_warning, context_critical,
      switch_threshold, telemetry, mock_mode, updated_at
    ) VALUES (1, @provider, @port, @contextWarning, @contextCritical,
              @switchThreshold, @telemetry, @mockMode, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      port = excluded.port,
      context_warning = excluded.context_warning,
      context_critical = excluded.context_critical,
      switch_threshold = excluded.switch_threshold,
      telemetry = excluded.telemetry,
      mock_mode = excluded.mock_mode,
      updated_at = excluded.updated_at
  `).run({
    ...settings,
    telemetry: settings.telemetry ? 1 : 0,
    mockMode: settings.mockMode ? 1 : 0,
    updatedAt: new Date().toISOString(),
  });
}

export function saveCompletedSession(session: PersistedSessionInput): void {
  const connection = db();
  const save = connection.transaction((input: PersistedSessionInput) => {
    const now = new Date().toISOString();
    const projectKey = input.repository ?? input.projectDir ?? input.cwd ?? input.project;
    connection.prepare(`
      INSERT INTO projects (project_key, name, repository, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_key) DO UPDATE SET
        name = excluded.name,
        repository = excluded.repository,
        updated_at = excluded.updated_at
    `).run(projectKey, input.project, input.repository ?? null, now, now);
    const project = connection.prepare(
      "SELECT id FROM projects WHERE project_key = ?",
    ).get(projectKey) as { id: number };

    connection.prepare(`
      INSERT INTO sessions (
        id, provider, project_id, started_at, ended_at, updated_at, cwd,
        project_dir, branch, model_id, model_name, modified_files,
        unsupported_fields, created_at
      ) VALUES (
        @id, @provider, @projectId, @startedAt, @endedAt, @updatedAt, @cwd,
        @projectDir, @branch, @modelId, @modelName, @modifiedFiles,
        @unsupportedFields, @createdAt
      )
      ON CONFLICT(id) DO UPDATE SET
        provider = excluded.provider,
        project_id = excluded.project_id,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        updated_at = excluded.updated_at,
        cwd = excluded.cwd,
        project_dir = excluded.project_dir,
        branch = excluded.branch,
        model_id = excluded.model_id,
        model_name = excluded.model_name,
        modified_files = excluded.modified_files,
        unsupported_fields = excluded.unsupported_fields
    `).run({
      id: input.id,
      provider: input.provider,
      projectId: project.id,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      updatedAt: input.updatedAt,
      cwd: input.cwd ?? null,
      projectDir: input.projectDir ?? null,
      branch: input.branch ?? null,
      modelId: input.modelId ?? null,
      modelName: input.modelName ?? null,
      modifiedFiles: input.modifiedFiles,
      unsupportedFields: JSON.stringify(input.unsupportedFields),
      createdAt: now,
    });

    connection.prepare(`
      INSERT INTO tasks (
        session_id, prompt, display_task, task_type, complexity_score,
        complexity_level, expected_files, expected_tool_calls, reasoning_level
      ) VALUES (
        @sessionId, @prompt, @displayTask, @taskType, @complexityScore,
        @complexityLevel, @expectedFiles, @expectedToolCalls, @reasoningLevel
      )
      ON CONFLICT(session_id) DO UPDATE SET
        prompt = excluded.prompt,
        display_task = excluded.display_task,
        task_type = excluded.task_type,
        complexity_score = excluded.complexity_score,
        complexity_level = excluded.complexity_level,
        expected_files = excluded.expected_files,
        expected_tool_calls = excluded.expected_tool_calls,
        reasoning_level = excluded.reasoning_level
    `).run({
      sessionId: input.id,
      prompt: input.prompt ?? null,
      displayTask: input.displayTask,
      ...input.analysis,
    });

    connection.prepare(`
      INSERT INTO predictions (
        session_id, token_min, token_max, token_confidence,
        cost_min, cost_max, cost_confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        token_min = excluded.token_min,
        token_max = excluded.token_max,
        token_confidence = excluded.token_confidence,
        cost_min = excluded.cost_min,
        cost_max = excluded.cost_max,
        cost_confidence = excluded.cost_confidence
    `).run(
      input.id,
      input.prediction.tokenEstimate.min,
      input.prediction.tokenEstimate.max,
      input.prediction.tokenEstimate.confidence,
      input.prediction.costEstimate.min,
      input.prediction.costEstimate.max,
      input.prediction.costEstimate.confidence,
    );

    connection.prepare(`
      INSERT INTO recommendations (
        session_id, action, title, reason, current_fit,
        recommended_fit, recommended_model
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        action = excluded.action,
        title = excluded.title,
        reason = excluded.reason,
        current_fit = excluded.current_fit,
        recommended_fit = excluded.recommended_fit,
        recommended_model = excluded.recommended_model
    `).run(
      input.id,
      input.recommendation.action,
      input.recommendation.title,
      input.recommendation.reason,
      input.recommendation.currentFit,
      input.recommendation.recommendedFit,
      input.recommendation.recommendedModel ?? null,
    );

    connection.prepare(`
      INSERT INTO usage (
        session_id, context_used, context_limit, session_cost, context_risk
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        context_used = excluded.context_used,
        context_limit = excluded.context_limit,
        session_cost = excluded.session_cost,
        context_risk = excluded.context_risk
    `).run(
      input.id,
      input.contextUsed ?? null,
      input.contextLimit ?? null,
      input.sessionCost ?? null,
      input.contextRisk,
    );
  });
  save(session);
}

export function listCompletedSessions(limit = 100): SessionHistoryItem[] {
  const rows = db().prepare(`
    SELECT
      s.id,
      s.ended_at AS date,
      p.name AS project,
      t.display_task AS task,
      s.model_name AS model,
      u.context_used AS actual_tokens,
      pr.token_min AS predicted_min,
      pr.token_max AS predicted_max,
      pr.token_confidence AS predicted_confidence,
      u.session_cost AS cost,
      t.complexity_score AS complexity,
      r.action AS recommendation,
      s.unsupported_fields
    FROM sessions s
    JOIN projects p ON p.id = s.project_id
    JOIN tasks t ON t.session_id = s.id
    JOIN predictions pr ON pr.session_id = s.id
    JOIN recommendations r ON r.session_id = s.id
    JOIN usage u ON u.session_id = s.id
    ORDER BY s.ended_at DESC
    LIMIT ?
  `).all(limit) as SessionHistoryRow[];

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    project: row.project,
    task: row.task,
    model: row.model ?? "Model not provided by Claude Code",
    actualTokens: row.actual_tokens ?? 0,
    predictedTokens: {
      min: row.predicted_min,
      max: row.predicted_max,
      confidence: row.predicted_confidence,
    },
    cost: row.cost ?? 0,
    complexity: row.complexity,
    recommendation: row.recommendation,
    unsupportedFields: parseUnsupportedFields(row.unsupported_fields),
  }));
}

export function loadCompletedSession(id: string): PersistedClaudeSession | undefined {
  const row = db().prepare(`
    SELECT
      s.id,
      s.started_at,
      s.updated_at,
      s.ended_at,
      s.cwd,
      s.project_dir,
      p.repository,
      p.name AS project,
      s.branch,
      t.prompt,
      s.model_id,
      s.model_name,
      u.context_used,
      u.context_limit,
      u.session_cost,
      s.modified_files
    FROM sessions s
    JOIN projects p ON p.id = s.project_id
    JOIN tasks t ON t.session_id = s.id
    JOIN usage u ON u.session_id = s.id
    WHERE s.id = ?
  `).get(id) as SessionStateRow | undefined;
  if (!row) return undefined;

  return {
    id: row.id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
    cwd: row.cwd ?? undefined,
    projectDir: row.project_dir ?? undefined,
    repository: row.repository ?? undefined,
    project: row.project ?? undefined,
    branch: row.branch ?? undefined,
    prompt: row.prompt ?? undefined,
    modelId: row.model_id ?? undefined,
    modelName: row.model_name ?? undefined,
    contextUsed: row.context_used ?? undefined,
    contextLimit: row.context_limit ?? undefined,
    sessionCost: row.session_cost ?? undefined,
    modifiedFiles: row.modified_files,
  };
}