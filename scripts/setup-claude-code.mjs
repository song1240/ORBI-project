#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const forceStatusLine = process.argv.includes("--force-status-line");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bridge = join(root, "scripts", "claude-code-bridge.mjs");
const runtimeDir = join(root, ".model-pilot", "claude-code");
const claudeDir = join(homedir(), ".claude");
const settingsPath = join(claudeDir, "settings.json");
const hookCommand = join(runtimeDir, "model-pilot-hook.cmd");
const statusCommand = join(runtimeDir, "model-pilot-status.cmd");
const tokenFile = join(runtimeDir, "bridge-token");

function cmdQuote(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function readSettings() {
  if (!existsSync(settingsPath)) return {};
  try {
    const parsed = JSON.parse(await readFile(settingsPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("settings root is not an object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Could not parse ${settingsPath}. Model Pilot did not change it. ${error instanceof Error ? error.message : ""}`,
    );
  }
}

function isModelPilotStatusLine(statusLine) {
  return statusLine?.type === "command" && statusLine?.command === statusCommand;
}

function addHook(settings, event) {
  settings.hooks ??= {};
  settings.hooks[event] ??= [];
  const groups = settings.hooks[event];
  const alreadyInstalled = groups.some((group) =>
    Array.isArray(group?.hooks) &&
    group.hooks.some((hook) => hook?.command === hookCommand),
  );
  if (!alreadyInstalled) {
    groups.push({
      hooks: [{
        type: "command",
        command: hookCommand,
        async: true,
        timeout: 5,
      }],
    });
  }
}

await mkdir(runtimeDir, { recursive: true });
await mkdir(claudeDir, { recursive: true });

if (!existsSync(tokenFile)) {
  await writeFile(tokenFile, `${randomBytes(32).toString("hex")}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

await writeFile(
  hookCommand,
  `@echo off\r\n${cmdQuote(process.execPath)} ${cmdQuote(bridge)}\r\n`,
  "utf8",
);
await writeFile(
  statusCommand,
  `@echo off\r\n${cmdQuote(process.execPath)} ${cmdQuote(bridge)} --status-line\r\n`,
  "utf8",
);

const settings = await readSettings();
if (
  settings.statusLine &&
  !isModelPilotStatusLine(settings.statusLine) &&
  !forceStatusLine
) {
  throw new Error(
    `Claude Code already has a custom status line in ${settingsPath}. ` +
    "No settings were changed. Re-run with --force-status-line to replace it after reviewing your existing configuration.",
  );
}

for (const event of [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "PostModelSwitch",
  "SessionEnd",
]) {
  addHook(settings, event);
}

settings.statusLine = {
  type: "command",
  command: statusCommand,
  padding: 0,
};

if (existsSync(settingsPath)) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const backup = `${settingsPath}.model-pilot-${timestamp}.bak`;
  await copyFile(settingsPath, backup);
  console.log(`Backed up Claude Code settings to ${backup}`);
}

const temporaryPath = `${settingsPath}.model-pilot.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
await rename(temporaryPath, settingsPath);

console.log("Model Pilot Claude Code hooks and status line are installed.");
console.log(`Settings: ${settingsPath}`);
console.log("Restart Claude Code, then start Model Pilot.");