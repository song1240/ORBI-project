import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import process from "node:process";

const mode = process.argv[2];

if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/run-local.mjs <dev|start>");
  process.exit(1);
}

mkdirSync(".model-pilot/data", { recursive: true });

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const commonEnv = {
  ...process.env,
  BASE_PATH: "/",
  LOCAL_WINDOWS: "1",
  LOCAL_API_PORT: process.env.LOCAL_API_PORT ?? "3792",
};
const apiEnv = {
  ...commonEnv,
  PORT: process.env.API_PORT ?? "3792",
  NODE_ENV: mode === "dev" ? "development" : "production",
  MODEL_PILOT_DATA_DIR:
    process.env.MODEL_PILOT_DATA_DIR ?? ".model-pilot/data",
  MODEL_PILOT_MOCK: process.env.MODEL_PILOT_MOCK ?? "true",
};
const dashboardEnv = {
  ...commonEnv,
  PORT: process.env.DASHBOARD_PORT ?? "3791",
};

const children = [];

function launch(args, env) {
  const child = spawn(pnpm, args, {
    env,
    stdio: "inherit",
    shell: false,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (!stopping && (code !== 0 || signal)) {
      console.error(
        `A Model Pilot process stopped unexpectedly (${signal ?? code}).`,
      );
      shutdown(code ?? 1);
    }
  });
}

let stopping = false;
function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    child.kill();
  }
  setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

launch(
  ["--filter", "@workspace/api-server", "run", mode === "dev" ? "dev" : "start"],
  apiEnv,
);
launch(
  [
    "--filter",
    "@workspace/model-pilot",
    "run",
    mode === "dev" ? "dev" : "start",
  ],
  dashboardEnv,
);