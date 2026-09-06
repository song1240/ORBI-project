import type { PilotSettings } from "@workspace/api-zod";

export type PilotRuntimeSettings = PilotSettings;

export const DEFAULT_PILOT_SETTINGS: PilotRuntimeSettings = {
  provider: "claude-code",
  port: 3792,
  contextWarning: 75,
  contextCritical: 85,
  switchThreshold: 15,
  telemetry: false,
  mockMode: true,
};