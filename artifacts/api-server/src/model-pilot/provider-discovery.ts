import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PilotProviderStatus } from "@workspace/api-zod";

const execFileAsync = promisify(execFile);
const DETECTION_TTL_MS = 10_000;
const COMMAND_TIMEOUT_MS = 1_500;

type ProviderDefinition = {
  id: PilotProviderStatus["id"];
  name: string;
  command: string;
  authArgs?: string[];
  authParser?: (output: string) => boolean | undefined;
};

const PROVIDERS: ProviderDefinition[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    authArgs: ["auth", "status", "--json"],
    authParser: parseJsonAuthentication,
  },
  {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    authArgs: ["login", "status"],
    authParser: parseTextAuthentication,
  },
  { id: "gemini", name: "Gemini CLI", command: "gemini" },
];

let cachedAt = 0;
let cachedProviders: PilotProviderStatus[] | undefined;

async function runCommand(command: string, args: string[]): Promise<{
  ok: boolean;
  output: string;
  timedOut: boolean;
}> {
  try {
    const useWindowsShim = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    const executable = useWindowsShim ? "cmd.exe" : command;
    const executableArgs = useWindowsShim
      ? ["/d", "/s", "/c", `"${command}" ${args.join(" ")}`]
      : args;
    const { stdout, stderr } = await execFileAsync(executable, executableArgs, {
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return { ok: true, output: `${stdout}\n${stderr}`.trim(), timedOut: false };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
    };
    return {
      ok: false,
      output: `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim(),
      timedOut: Boolean(failure.killed || failure.code === "ETIMEDOUT"),
    };
  }
}

async function resolveCommand(command: string): Promise<string | undefined> {
  const resolver = process.platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileAsync(resolver, [command], {
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return stdout
      .split(/\r?\n/)
      .map((candidate) => candidate.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

function firstLine(value: string): string | null {
  const line = value.split(/\r?\n/, 1)[0]?.trim();
  return line || null;
}

function parseJsonAuthentication(value: string): boolean | undefined {
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    for (const key of ["loggedIn", "authenticated", "isAuthenticated"]) {
      if (typeof payload[key] === "boolean") return payload[key];
    }
  } catch {
    // Older CLI versions may not support JSON status output.
  }
  return undefined;
}

function parseTextAuthentication(value: string): boolean | undefined {
  if (/not logged in|login required|not authenticated|signed out/i.test(value)) return false;
  if (/logged in|authenticated|signed in/i.test(value)) return true;
  return undefined;
}

function providerStatus(
  provider: ProviderDefinition,
  status: Omit<PilotProviderStatus, "id" | "name" | "command">,
): PilotProviderStatus {
  return {
    id: provider.id,
    name: provider.name,
    command: provider.command,
    ...status,
  };
}

async function detectProvider(provider: ProviderDefinition): Promise<PilotProviderStatus> {
  const resolvedCommand = await resolveCommand(provider.command);
  if (!resolvedCommand) {
    return providerStatus(provider, {
      installed: false,
      authentication: "unknown",
      status: "not-installed",
      version: null,
      detailCode: "cli-not-found",
    });
  }

  const versionResult = await runCommand(resolvedCommand, ["--version"]);
  if (!versionResult.ok) {
    return providerStatus(provider, {
      installed: true,
      authentication: "unknown",
      status: "unavailable",
      version: null,
      detailCode: "probe-failed",
    });
  }

  const version = firstLine(versionResult.output);
  if (!provider.authArgs) {
    return providerStatus(provider, {
      installed: true,
      authentication: "unknown",
      status: "installed",
      version,
      detailCode: "installed-auth-unknown",
    });
  }

  const authResult = await runCommand(resolvedCommand, provider.authArgs);
  if (authResult.timedOut) {
    return providerStatus(provider, {
      installed: true,
      authentication: "unknown",
      status: "unavailable",
      version,
      detailCode: "probe-failed",
    });
  }
  const unsupportedCommand = /unknown (command|option)|unrecognized|invalid (command|option)/i.test(authResult.output);
  const parsedAuthentication = provider.authParser?.(authResult.output);
  if (authResult.ok && parsedAuthentication === true) {
    return providerStatus(provider, {
      installed: true,
      authentication: "connected",
      status: "ready",
      version,
      detailCode: "ready",
    });
  }

  if (authResult.ok && parsedAuthentication === undefined) {
    return providerStatus(provider, {
      installed: true,
      authentication: "unknown",
      status: "installed",
      version,
      detailCode: "installed-auth-unknown",
    });
  }

  return providerStatus(provider, {
    installed: true,
    authentication: unsupportedCommand ? "unknown" : "sign-in-required",
    status: "installed",
    version,
    detailCode: unsupportedCommand ? "installed-auth-unknown" : "sign-in-required",
  });
}

export async function listLocalProviders(): Promise<PilotProviderStatus[]> {
  if (cachedProviders && Date.now() - cachedAt < DETECTION_TTL_MS) {
    return cachedProviders;
  }

  const providers = await Promise.all(PROVIDERS.map(detectProvider));
  cachedAt = Date.now();
  cachedProviders = providers;
  return providers;
}