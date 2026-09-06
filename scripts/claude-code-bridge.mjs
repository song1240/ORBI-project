#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv.includes("--status-line") ? "status-line" : "hook";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tokenFile = join(root, ".model-pilot", "claude-code", "bridge-token");
function localApiUrl() {
  const candidate =
    process.env.MODEL_PILOT_API_URL ??
    "http://127.0.0.1:3792/api/pilot/claude-code/events";
  try {
    const url = new URL(candidate);
    const loopback =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]";
    return url.protocol === "http:" &&
      loopback &&
      url.port === "3792" &&
      url.pathname === "/api/pilot/claude-code/events"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const apiUrl = localApiUrl();

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
      if (input.length > 2_000_000) reject(new Error("Claude Code event is too large"));
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeHook(payload) {
  const input = object(payload.tool_input);
  const response = object(payload.tool_response);
  return {
    session_id: payload.session_id,
    prompt_id: payload.prompt_id,
    transcript_path: payload.transcript_path,
    cwd: payload.cwd,
    permission_mode: payload.permission_mode,
    effort: payload.effort,
    hook_event_name: payload.hook_event_name,
    source: payload.source,
    model: payload.model,
    session_title: payload.session_title,
    prompt: payload.prompt,
    tool_name: payload.tool_name,
    tool_use_id: payload.tool_use_id,
    duration_ms: payload.duration_ms,
    reason: payload.reason,
    from_model: payload.from_model,
    to_model: payload.to_model,
    tool_input: {
      file_path: input.file_path,
      path: input.path,
      description: input.description,
      command: input.command,
    },
    tool_response: {
      success: response.success,
      filePath: response.filePath,
    },
  };
}

function sanitizeStatusLine(payload) {
  return {
    session_id: payload.session_id,
    prompt_id: payload.prompt_id,
    transcript_path: payload.transcript_path,
    cwd: payload.cwd,
    model: payload.model,
    workspace: payload.workspace,
    cost: payload.cost,
    context_window: payload.context_window,
    effort: payload.effort,
    worktree: payload.worktree,
    version: payload.version,
  };
}

function statusText(payload, connected) {
  const model = payload?.model?.display_name ?? payload?.model?.id ?? "model unavailable";
  const used = payload?.context_window?.used_percentage;
  const cost = payload?.cost?.total_cost_usd;
  const parts = [`Model Pilot ${connected ? "connected" : "offline"}`, model];
  if (typeof used === "number") parts.push(`${Math.round(used)}% context`);
  if (typeof cost === "number") parts.push(`$${cost.toFixed(2)}`);
  return parts.join(" · ");
}

let payload = {};
let connected = false;

try {
  const raw = await readStdin();
  payload = JSON.parse(raw);
  const bridgeToken = (await readFile(tokenFile, "utf8")).trim();
  if (!bridgeToken) throw new Error("Model Pilot bridge token is missing");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    if (!apiUrl) throw new Error("Model Pilot API URL must be local");
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-model-pilot-bridge-token": bridgeToken,
      },
      body: JSON.stringify({
        source,
        payload: source === "status-line"
          ? sanitizeStatusLine(payload)
          : sanitizeHook(payload),
      }),
      signal: controller.signal,
    });
    connected = response.ok;
  } finally {
    clearTimeout(timeout);
  }
} catch {
  // Hooks must never block Claude Code when Model Pilot is not running.
}

if (source === "status-line") {
  console.log(statusText(payload, connected));
}