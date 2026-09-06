import { Router, type IRouter } from "express";
import {
  GetPilotLiveResponse,
  GetPilotSettingsResponse,
  ListPilotSessionsResponse,
  UpdatePilotSettingsBody,
  UpdatePilotSettingsResponse,
} from "@workspace/api-zod";
import {
  getMockSnapshot,
  sessionHistory,
  type PilotRuntimeSettings,
} from "../model-pilot/mock-provider";

const router: IRouter = Router();

let settings: PilotRuntimeSettings = {
  provider: "claude-code",
  port: 3791,
  contextWarning: 75,
  contextCritical: 85,
  switchThreshold: 15,
  telemetry: false,
  mockMode: true,
};

router.get("/pilot/live", (_req, res) => {
  res.json(GetPilotLiveResponse.parse(getMockSnapshot(settings)));
});

router.get("/pilot/sessions", (_req, res) => {
  res.json(ListPilotSessionsResponse.parse(sessionHistory));
});

router.get("/pilot/settings", (_req, res) => {
  res.json(GetPilotSettingsResponse.parse(settings));
});

router.patch("/pilot/settings", (req, res) => {
  const update = UpdatePilotSettingsBody.parse(req.body);
  settings = { ...settings, ...update };
  res.json(UpdatePilotSettingsResponse.parse(settings));
});

export default router;