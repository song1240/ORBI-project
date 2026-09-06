import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  IngestClaudeCodeEventBody,
  IngestClaudeCodeEventResponse,
  GetPilotLiveResponse,
  GetPilotSettingsResponse,
  ListPilotSessionsResponse,
  UpdatePilotSettingsBody,
  UpdatePilotSettingsResponse,
} from "@workspace/api-zod";
import {
  getMockSnapshot,
  sessionHistory,
} from "../model-pilot/mock-provider";
import {
  getClaudeCodeSnapshot,
  getDisconnectedSnapshot,
  ingestClaudeCodeEvent,
  listClaudeCodeSessions,
} from "../model-pilot/claude-code-provider";
import {
  loadSettings,
  saveSettings,
} from "../model-pilot/persistence";
import {
  DEFAULT_PILOT_SETTINGS,
  type PilotRuntimeSettings,
} from "../model-pilot/settings";

const router: IRouter = Router();

async function readBridgeToken(): Promise<string | undefined> {
  const candidates = [
    process.env["MODEL_PILOT_BRIDGE_TOKEN_FILE"],
    resolve(process.cwd(), ".model-pilot", "claude-code", "bridge-token"),
    resolve(process.cwd(), "..", "..", ".model-pilot", "claude-code", "bridge-token"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const token = (await readFile(candidate, "utf8")).trim();
      if (token) return token;
    } catch {
      // Try the next supported workspace-relative location.
    }
  }
  return undefined;
}

function tokenMatches(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes);
}

let settings: PilotRuntimeSettings = loadSettings(DEFAULT_PILOT_SETTINGS);

router.get("/pilot/live", (_req, res) => {
  const realSnapshot = getClaudeCodeSnapshot(settings);
  const snapshot = realSnapshot ?? (settings.mockMode
    ? getMockSnapshot(settings)
    : getDisconnectedSnapshot());
  res.json(GetPilotLiveResponse.parse(snapshot));
});

router.get("/pilot/sessions", (_req, res) => {
  const realSessions = listClaudeCodeSessions();
  res.json(ListPilotSessionsResponse.parse(
    realSessions.length || !settings.mockMode ? realSessions : sessionHistory,
  ));
});

router.post("/pilot/claude-code/events", (req, res) => {
  const hostname = req.hostname.toLowerCase();
  const remoteAddress = req.socket.remoteAddress ?? "";
  const localHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";
  const localSocket =
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1";

  if (!localHost || !localSocket || req.get("origin")) {
    res.status(403).json({ error: "Claude Code events are accepted from localhost only." });
    return;
  }

  void (async () => {
    const expectedToken = await readBridgeToken();
    const providedToken = req.get("x-model-pilot-bridge-token") ?? "";
    if (!expectedToken) {
      res.status(503).json({ error: "Claude Code bridge is not installed." });
      return;
    }
    if (!tokenMatches(expectedToken, providedToken)) {
      res.status(401).json({ error: "Invalid Claude Code bridge token." });
      return;
    }

    try {
    const event = IngestClaudeCodeEventBody.parse(req.body);
    const result = ingestClaudeCodeEvent(event.source, event.payload, settings);
    res.status(202).json(IngestClaudeCodeEventResponse.parse(result));
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid Claude Code event",
      });
    }
  })();
});

router.get("/pilot/settings", (_req, res) => {
  res.json(GetPilotSettingsResponse.parse(settings));
});

router.patch("/pilot/settings", (req, res) => {
  const update = UpdatePilotSettingsBody.parse(req.body);
  const nextSettings = { ...settings, ...update };
  saveSettings(nextSettings);
  settings = nextSettings;
  res.json(UpdatePilotSettingsResponse.parse(settings));
});

export default router;