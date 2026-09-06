#!/usr/bin/env node

import { existsSync } from "node:fs";
import { copyFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(root, ".model-pilot");
const processFile = join(runtimeDir, "processes.json");
const dataDir = process.env.MODEL_PILOT_DATA_DIR
  ? resolve(process.env.MODEL_PILOT_DATA_DIR)
  : join(runtimeDir, "data");
const databasePath = join(dataDir, "model-pilot.sqlite");

if (existsSync(processFile)) {
  throw new Error(
    "Model Pilot may still be running. Run the Windows stop script first, " +
    "then remove a confirmed-stale .model-pilot/processes.json file if necessary.",
  );
}

const timestamp = new Date().toISOString().replaceAll(":", "-");
const backupDir = join(runtimeDir, "backups", `database-reset-${timestamp}`);
const candidates = [
  databasePath,
  `${databasePath}-wal`,
  `${databasePath}-shm`,
  `${databasePath}-journal`,
];
const existing = candidates.filter((path) => existsSync(path));

if (!existing.length) {
  console.log(`No Model Pilot database was found at ${databasePath}`);
  process.exit(0);
}

await mkdir(backupDir, { recursive: true });
for (const source of existing) {
  const destination = join(backupDir, source.slice(dataDir.length + 1));
  try {
    await rename(source, destination);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await copyFile(source, destination);
    await unlink(source);
  }
}

console.log(`Model Pilot data was reset. The previous database is retained at ${backupDir}`);