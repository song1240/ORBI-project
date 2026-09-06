import { analyzeTask, predictResources, recommendModel } from "./engine";

const startedAt = Date.now();
const prompt = "Refactor the authentication system and update related API tests";

export interface PilotRuntimeSettings {
  provider: string;
  port: number;
  contextWarning: number;
  contextCritical: number;
  switchThreshold: number;
  telemetry: boolean;
  mockMode: boolean;
}

export function getMockSnapshot(settings: PilotRuntimeSettings) {
  const elapsedSteps = Math.floor((Date.now() - startedAt) / 5_000);
  const contextUsed = Math.min(181_000, 127_400 + elapsedSteps * 620);
  const sessionCost = Number((1.64 + elapsedSteps * 0.013).toFixed(2));
  const contextLimit = 200_000;
  const usage = Math.round((contextUsed / contextLimit) * 100);
  const analysis = analyzeTask(prompt);
  const prediction = predictResources(analysis);
  const now = Date.now();

  return {
    connection: "CONNECTED",
    provider: "Claude Code",
    project: "model-pilot",
    repository: "C:\\projects\\model-pilot",
    branch: "main",
    modifiedFiles: 7,
    model: "Sonnet",
    modelTier: "High",
    contextUsed,
    contextLimit,
    sessionCost,
    task: "Authentication System Refactor",
    ...analysis,
    contextRisk:
      usage >= settings.contextCritical
        ? "CRITICAL"
        : usage >= settings.contextWarning
          ? "WARNING"
          : usage >= 60
            ? "WATCH"
            : "NORMAL",
    ...prediction,
    recommendation: recommendModel(analysis, usage, settings.switchThreshold),
    recentActivity: [
      { id: "a1", label: "Tool completed", detail: "Updated API route tests", timestamp: new Date(now - 4_000).toISOString(), kind: "tool" },
      { id: "a2", label: "Context analyzed", detail: `${usage}% of window in use`, timestamp: new Date(now - 12_000).toISOString(), kind: "context" },
      { id: "a3", label: "Task classified", detail: analysis.taskType, timestamp: new Date(now - 68_000).toISOString(), kind: "analysis" },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export const sessionHistory = [
  {
    id: "sess-1042",
    date: "2026-09-06T08:42:00.000Z",
    project: "model-pilot",
    task: "Authentication System Refactor",
    model: "Sonnet",
    actualTokens: 112400,
    predictedTokens: { min: 68000, max: 171000, confidence: 72 },
    cost: 2.31,
    complexity: 85,
    recommendation: "KEEP",
  },
  {
    id: "sess-1041",
    date: "2026-09-05T04:18:00.000Z",
    project: "m4u-app",
    task: "Checkout API bug fix",
    model: "Sonnet",
    actualTokens: 38420,
    predictedTokens: { min: 24000, max: 72000, confidence: 81 },
    cost: 0.74,
    complexity: 52,
    recommendation: "KEEP",
  },
  {
    id: "sess-1040",
    date: "2026-09-03T11:06:00.000Z",
    project: "analytics-console",
    task: "Repository architecture review",
    model: "Haiku",
    actualTokens: 91800,
    predictedTokens: { min: 65000, max: 155000, confidence: 69 },
    cost: 0.98,
    complexity: 91,
    recommendation: "UPGRADE",
  },
];