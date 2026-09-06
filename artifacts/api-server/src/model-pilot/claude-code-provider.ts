import { basename, win32 } from "node:path";
import type {
  ActivityItem,
  LiveSnapshot,
  PilotSettings,
  SessionHistoryItem,
} from "@workspace/api-zod";
import { analyzeTask, predictResources, recommendModel, type TaskAnalysis } from "./engine";
import {
  listCompletedSessions,
  loadCompletedSession,
  saveCompletedSession,
} from "./persistence";
import type { PilotRuntimeSettings } from "./settings";

type JsonRecord = Record<string, unknown>;
type EventSource = "hook" | "status-line";

interface ClaudeSession {
  id: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  cwd?: string;
  projectDir?: string;
  repository?: string;
  project?: string;
  branch?: string;
  transcriptPath?: string;
  prompt?: string;
  modelId?: string;
  modelName?: string;
  contextUsed?: number;
  contextLimit?: number;
  sessionCost?: number;
  activities: ActivityItem[];
  modifiedFiles: Set<string>;
  persistedModifiedFiles: number;
}

const sessions = new Map<string, ClaudeSession>();
let activeSessionId: string | undefined;
let activitySequence = 0;

const emptyAnalysis: TaskAnalysis = {
  taskType: "UNKNOWN",
  complexityScore: 0,
  complexityLevel: "LOW",
  expectedFiles: 0,
  expectedToolCalls: 0,
  reasoningLevel: "UNKNOWN",
};

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fileName(value: string): string {
  return value.includes("\\") ? win32.basename(value) : basename(value);
}

function truncate(value: string, length = 140): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function projectName(directory?: string): string | undefined {
  return directory ? fileName(directory.replace(/[\\/]+$/, "")) : undefined;
}

function modelTier(model?: string): string {
  if (!model) return "Not provided by Claude Code";
  if (/opus/i.test(model)) return "Highest";
  if (/sonnet/i.test(model)) return "High";
  if (/haiku/i.test(model)) return "Fast";
  return "Unknown model tier";
}

function addActivity(
  session: ClaudeSession,
  label: string,
  detail: string,
  kind: string,
) {
  session.activities.unshift({
    id: `${session.id}-${++activitySequence}`,
    label,
    detail: truncate(detail),
    timestamp: new Date().toISOString(),
    kind,
  });
  session.activities = session.activities.slice(0, 50);
}

function ensureSession(payload: JsonRecord): ClaudeSession {
  const id = text(payload.session_id);
  if (!id) throw new Error("Claude Code event is missing session_id");

  let session = sessions.get(id);
  if (!session) {
    const now = new Date().toISOString();
    const persisted = loadCompletedSession(id);
    session = persisted
      ? {
          ...persisted,
          activities: [],
          modifiedFiles: new Set(),
          persistedModifiedFiles: persisted.modifiedFiles,
        }
      : {
          id,
          startedAt: now,
          updatedAt: now,
          activities: [],
          modifiedFiles: new Set(),
          persistedModifiedFiles: 0,
        };
    sessions.set(id, session);
  }

  session.updatedAt = new Date().toISOString();
  session.cwd = text(payload.cwd) ?? session.cwd;
  session.transcriptPath = text(payload.transcript_path) ?? session.transcriptPath;
  return session;
}

function toolDetail(payload: JsonRecord): string {
  const toolName = text(payload.tool_name) ?? "Unknown tool";
  const input = record(payload.tool_input);
  const filePath = text(input?.file_path) ?? text(input?.path);
  if (filePath) return `${toolName}: ${fileName(filePath)}`;
  const description = text(input?.description);
  if (description) return `${toolName}: ${description}`;
  const command = text(input?.command);
  if (command) return `${toolName}: ${truncate(command, 100)}`;
  return toolName;
}

function updateFromHook(
  session: ClaudeSession,
  payload: JsonRecord,
  settings: PilotRuntimeSettings,
) {
  const event = text(payload.hook_event_name) ?? "UnknownHook";
  const model = text(payload.model);
  if (model) {
    session.modelId = model;
    session.modelName = model;
  }

  if (event === "SessionStart") {
    activeSessionId = session.id;
    session.endedAt = undefined;
    session.persistedModifiedFiles = 0;
    addActivity(session, "Session started", text(payload.source) ?? "startup", "session");
    return;
  }

  if (event === "UserPromptSubmit") {
    const prompt = text(payload.prompt);
    if (prompt) {
      session.prompt = prompt;
      addActivity(session, "Prompt submitted", truncate(prompt), "prompt");
    }
    activeSessionId = session.id;
    return;
  }

  if (event === "PostToolUse") {
    const input = record(payload.tool_input);
    const filePath = text(input?.file_path) ?? text(input?.path);
    const toolName = text(payload.tool_name) ?? "";
    if (filePath && /write|edit|notebookedit/i.test(toolName)) {
      session.modifiedFiles.add(filePath);
    }
    addActivity(session, "Tool completed", toolDetail(payload), "tool");
    activeSessionId = session.id;
    return;
  }

  if (event === "PostModelSwitch") {
    const toModel = text(payload.to_model);
    if (toModel) {
      session.modelId = toModel;
      session.modelName = toModel;
    }
    addActivity(session, "Model switched", toModel ?? "Model name not provided", "model");
    activeSessionId = session.id;
    return;
  }

  if (event === "SessionEnd") {
    session.endedAt = new Date().toISOString();
    addActivity(session, "Session ended", text(payload.reason) ?? "Reason not provided", "session");
    finishSession(session, settings);
    if (activeSessionId === session.id) activeSessionId = undefined;
  }
}

function updateFromStatusLine(
  session: ClaudeSession,
  payload: JsonRecord,
  settings: PilotRuntimeSettings,
) {
  const model = record(payload.model);
  session.modelId = text(model?.id) ?? session.modelId;
  session.modelName = text(model?.display_name) ?? session.modelName;

  const workspace = record(payload.workspace);
  session.cwd = text(workspace?.current_dir) ?? text(payload.cwd) ?? session.cwd;
  session.projectDir = text(workspace?.project_dir) ?? session.projectDir;

  const repository = record(workspace?.repo);
  const repoName = text(repository?.name);
  const repoOwner = text(repository?.owner);
  const repoHost = text(repository?.host);
  session.project = repoName ?? projectName(session.projectDir ?? session.cwd) ?? session.project;
  if (repoName) {
    session.repository = [repoHost, repoOwner, repoName].filter(Boolean).join("/");
  } else {
    session.repository = session.projectDir ?? session.cwd ?? session.repository;
  }

  const worktree = record(payload.worktree);
  session.branch = text(worktree?.branch) ?? session.branch;

  const context = record(payload.context_window);
  const contextLimit = numberValue(context?.context_window_size);
  const usedPercentage = numberValue(context?.used_percentage);
  session.contextLimit = contextLimit ?? session.contextLimit;
  session.contextUsed =
    contextLimit !== undefined && usedPercentage !== undefined
      ? Math.round(contextLimit * usedPercentage / 100)
      : session.contextUsed;

  const cost = record(payload.cost);
  session.sessionCost = numberValue(cost?.total_cost_usd) ?? session.sessionCost;
  if (session.endedAt) {
    finishSession(session, settings);
  } else {
    activeSessionId = session.id;
  }
}

function finishSession(session: ClaudeSession, settings: PilotRuntimeSettings) {
  const prompt = session.prompt;
  const analysis = prompt ? analyzeTask(prompt) : emptyAnalysis;
  const prediction = prompt
    ? predictResources(analysis)
    : {
        tokenEstimate: { min: 0, max: 0, confidence: 0 },
        costEstimate: { min: 0, max: 0, confidence: 0 },
      };
  const recommendation = prompt
    ? recommendModel(analysis, contextUsage(session), settings.switchThreshold)
    : {
        action: "UNAVAILABLE",
        title: "RECOMMENDATION UNAVAILABLE",
        reason: "Claude Code did not provide a prompt for this session.",
        currentFit: 0,
        recommendedFit: 0,
        recommendedModel: null,
      };
  const unsupportedFields = [
    !session.modelName && "model",
    session.contextUsed === undefined && "actualTokens",
    session.sessionCost === undefined && "cost",
    !prompt && "prompt",
  ].filter((value): value is string => Boolean(value));

  const historyItem: SessionHistoryItem = {
    id: session.id,
    date: session.endedAt ?? session.updatedAt,
    project: session.project ?? projectName(session.projectDir ?? session.cwd) ?? "Unknown project",
    task: prompt ? truncate(prompt, 180) : "Prompt not provided by Claude Code",
    model: session.modelName ?? session.modelId ?? "Model not provided by Claude Code",
    actualTokens: session.contextUsed ?? 0,
    predictedTokens: prediction.tokenEstimate,
    cost: session.sessionCost ?? 0,
    complexity: analysis.complexityScore,
    recommendation: prompt
      ? recommendation.action
      : "UNAVAILABLE",
    unsupportedFields,
  };

  const contextRisk =
    session.contextUsed === undefined || session.contextLimit === undefined
      ? "UNKNOWN"
      : contextUsage(session) >= settings.contextCritical
        ? "CRITICAL"
        : contextUsage(session) >= settings.contextWarning
          ? "WARNING"
          : contextUsage(session) >= 60
            ? "WATCH"
            : "NORMAL";

  saveCompletedSession({
    id: session.id,
    provider: "claude-code",
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? session.updatedAt,
    updatedAt: session.updatedAt,
    cwd: session.cwd,
    projectDir: session.projectDir,
    repository: session.repository,
    project: historyItem.project,
    branch: session.branch,
    prompt,
    displayTask: historyItem.task,
    modelId: session.modelId,
    modelName: session.modelName ?? session.modelId,
    modifiedFiles: session.persistedModifiedFiles + session.modifiedFiles.size,
    contextUsed: session.contextUsed,
    contextLimit: session.contextLimit,
    sessionCost: session.sessionCost,
    contextRisk,
    unsupportedFields,
    analysis,
    prediction,
    recommendation,
  });
}

function contextUsage(session: ClaudeSession): number {
  return session.contextUsed !== undefined && session.contextLimit
    ? Math.round(session.contextUsed / session.contextLimit * 100)
    : 0;
}

export function ingestClaudeCodeEvent(
  source: EventSource,
  payload: JsonRecord,
  settings: PilotRuntimeSettings,
) {
  const session = ensureSession(payload);
  if (source === "status-line") updateFromStatusLine(session, payload, settings);
  else updateFromHook(session, payload, settings);

  return {
    accepted: true,
    sessionId: session.id,
    event: source === "status-line"
      ? "StatusLine"
      : text(payload.hook_event_name) ?? "UnknownHook",
  };
}

export function getClaudeCodeSnapshot(settings: PilotSettings): LiveSnapshot | null {
  const session = activeSessionId ? sessions.get(activeSessionId) : undefined;
  if (!session || session.endedAt) return null;

  const prompt = session.prompt;
  const analysis = prompt ? analyzeTask(prompt) : emptyAnalysis;
  const prediction = prompt
    ? predictResources(analysis)
    : {
        tokenEstimate: { min: 0, max: 0, confidence: 0 },
        costEstimate: { min: 0, max: 0, confidence: 0 },
      };
  const usage = contextUsage(session);
  const unsupportedFields = [
    !session.modelName && "model",
    session.contextUsed === undefined && "contextUsed",
    session.contextLimit === undefined && "contextLimit",
    session.sessionCost === undefined && "sessionCost",
    !prompt && "prompt",
    !session.branch && "branch",
  ].filter((value): value is string => Boolean(value));

  return {
    connection: "CONNECTED",
    provider: "Claude Code",
    project: session.project ?? projectName(session.projectDir ?? session.cwd) ?? "Unknown project",
    repository: session.repository ?? session.projectDir ?? session.cwd,
    branch: session.branch ?? "Not provided by Claude Code",
    modifiedFiles: session.modifiedFiles.size,
    model: session.modelName ?? session.modelId ?? "Not provided by Claude Code",
    modelTier: modelTier(session.modelName ?? session.modelId),
    contextUsed: session.contextUsed ?? 0,
    contextLimit: session.contextLimit ?? 0,
    sessionCost: session.sessionCost ?? 0,
    task: prompt ? truncate(prompt, 180) : "Waiting for a Claude Code prompt",
    ...analysis,
    contextRisk: session.contextUsed === undefined || session.contextLimit === undefined
      ? "UNKNOWN"
      : usage >= settings.contextCritical
        ? "CRITICAL"
        : usage >= settings.contextWarning
          ? "WARNING"
          : usage >= 60
            ? "WATCH"
            : "NORMAL",
    ...prediction,
    recommendation: prompt
      ? recommendModel(analysis, usage, settings.switchThreshold)
      : {
          action: "WAITING",
          title: "WAITING FOR A PROMPT",
          reason: "Claude Code has not submitted a user prompt to Model Pilot yet.",
          currentFit: 0,
          recommendedFit: 0,
          recommendedModel: null,
        },
    recentActivity: session.activities.slice(0, 12),
    updatedAt: new Date(session.updatedAt),
    dataSource: "claude-code",
    sessionId: session.id,
    unsupportedFields,
  };
}

export function getDisconnectedSnapshot(): LiveSnapshot {
  const unavailable = [
    "model",
    "contextUsed",
    "contextLimit",
    "sessionCost",
    "prompt",
    "branch",
  ];
  return {
    connection: "WAITING",
    provider: "Claude Code",
    project: "Waiting for Claude Code",
    branch: "Not provided by Claude Code",
    modifiedFiles: 0,
    model: "Not provided by Claude Code",
    modelTier: "Not provided by Claude Code",
    contextUsed: 0,
    contextLimit: 0,
    sessionCost: 0,
    task: "Start a Claude Code session after installing the Model Pilot hooks.",
    ...emptyAnalysis,
    contextRisk: "UNKNOWN",
    tokenEstimate: { min: 0, max: 0, confidence: 0 },
    costEstimate: { min: 0, max: 0, confidence: 0 },
    recommendation: {
      action: "WAITING",
      title: "WAITING FOR CLAUDE CODE",
      reason: "No supported Claude Code hook or status-line data has been received.",
      currentFit: 0,
      recommendedFit: 0,
      recommendedModel: null,
    },
    recentActivity: [],
    updatedAt: new Date(),
    dataSource: "disconnected",
    sessionId: null,
    unsupportedFields: unavailable,
  };
}

export function listClaudeCodeSessions(): SessionHistoryItem[] {
  return listCompletedSessions();
}