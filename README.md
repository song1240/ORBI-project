# Model Pilot

Model Pilot is a local-first AI resource meter and model advisor for coding agents. It separates measured session data from future estimates, evaluates task complexity with local rules, and recommends whether to keep or reconsider the current model.

> Current status: the dashboard and Mock Provider are runnable. Claude Code hook ingestion and SQLite persistence are being implemented as separate follow-up work.

## What the current build includes

- Live model, context, cost, task, complexity, repository, and activity display
- Token and completion-cost estimate ranges with confidence
- Rule-based model-fit recommendation with a switch threshold
- Context risk states: Normal, Watch, Warning, and Critical
- Session history and settings screens
- A Mock Provider whose context and cost increase over time
- Telemetry disabled by default

Actual values and estimates remain separate in both the API contract and the user interface. Model Pilot does not automatically change models.

## Architecture

```text
Browser (localhost:3791)
  └─ React + TypeScript dashboard
       └─ /api requests proxied locally
            └─ Express API (localhost:3792)
                 ├─ Coding-agent provider boundary
                 ├─ Rule-based task analyzer
                 ├─ Token/cost predictor
                 └─ Recommendation engine
```

The Replit workspace uses path-based routing during development. The Windows launcher enables a local-only Vite proxy so the browser can keep calling `/api` while the API runs on port 3792.

## Windows requirements

- Windows 10 or Windows 11, 64-bit
- PowerShell 5.1 or PowerShell 7+
- Node.js 20 LTS or newer
- Internet access during the first dependency installation

No API key is required for Mock Mode.

## Windows installation

Open PowerShell in the cloned project directory:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1
```

The installer:

1. verifies Node.js;
2. enables or installs pnpm 10.26.1;
3. installs the locked dependencies, including Windows-native build binaries;
4. runs the full TypeScript check;
5. builds the API and dashboard;
6. creates `.model-pilot\logs`.

To install dependencies without building:

```powershell
.\scripts\install-windows.ps1 -SkipBuild
```

## Start and stop

Start Model Pilot and open the browser:

```powershell
.\scripts\start-windows.ps1
```

Dashboard: <http://localhost:3791>  
API: <http://localhost:3792/api/healthz>

Start without opening a browser:

```powershell
.\scripts\start-windows.ps1 -NoBrowser
```

Force a fresh check and build before starting:

```powershell
.\scripts\start-windows.ps1 -Rebuild
```

Stop both background processes:

```powershell
.\scripts\stop-windows.ps1
```

The launcher binds both services to `127.0.0.1`, so they are not exposed to other machines on the LAN. It refuses to start when ports 3791 or 3792 are occupied. Runtime process IDs, start times, command markers, and logs are stored under `.model-pilot`, which is excluded from Git. The stop script validates this identity before terminating a process, preventing stale PID reuse from killing an unrelated application.

## Replit development

Use the configured workflows:

- `artifacts/api-server: API Server`
- `artifacts/model-pilot: web`

Useful checks:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/model-pilot run typecheck
```

The Vite build requires workflow or local-launcher environment variables:

```text
PORT=3791
BASE_PATH=/
LOCAL_WINDOWS=1
```

Do not run the root workspace with `pnpm dev`; each service has its own managed workflow.

## GitHub workflow

1. Push this repository to a private or public GitHub repository.
2. On the Windows PC, install Git and Node.js 20+.
3. Clone the repository.
4. Run `.\scripts\install-windows.ps1`.
5. Run `.\scripts\start-windows.ps1`.
6. Pull future updates with `git pull`, then restart with `.\scripts\start-windows.ps1 -Rebuild`.

Do not commit `.model-pilot`, environment files, databases, or logs.

## Claude Code integration

The production integration is designed around a provider abstraction rather than embedding Claude-specific behavior in the analyzer or UI. The target adapter consumes supported Claude Code hooks/status information for:

- session start and end;
- current model and session ID;
- user prompt submission;
- pre-tool and post-tool activity;
- context and cost when reported by Claude Code.

Until that adapter is enabled, keep **Mock Mode** on in Pilot Settings. Missing production fields will be shown as unavailable rather than fabricated.

## Configuration

Pilot Settings currently exposes:

- coding-agent provider;
- dashboard port preference;
- context warning and critical thresholds;
- model switch threshold;
- telemetry;
- Mock Mode.

The Windows runtime ports are currently fixed to 3791 for the dashboard and 3792 for the API. The settings port field is reserved for the persistence/configuration follow-up.

## Privacy and security

- Source code and prompts are not sent to an external Model Pilot service.
- Task analysis and prediction are local and rule-based.
- Telemetry is off by default.
- Automatic model switching is disabled.
- Never store API keys in the database or source tree. Use local environment variables when a future provider requires credentials.

## Troubleshooting

### Script execution is disabled

Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

This changes policy only for the current PowerShell process.

### Node.js is missing or too old

Install the current Node.js LTS release from <https://nodejs.org>, close PowerShell, reopen it, and rerun the installer.

### pnpm cannot be activated

The installer first tries Corepack, then falls back to `npm install --global pnpm@10.26.1`. If both fail, open PowerShell as Administrator and rerun the installer.

### Port 3791 or 3792 is already in use

Stop the process using the port, or run:

```powershell
.\scripts\stop-windows.ps1
```

If Model Pilot previously crashed, remove `.model-pilot\processes.json` only after confirming its recorded processes are no longer running.

### The browser opens but API data is unavailable

Check:

```text
.model-pilot\logs\api-*.error.log
.model-pilot\logs\web-*.error.log
```

Then verify <http://localhost:3792/api/healthz>. Restart with `-Rebuild` after fixing the reported error.

### Dependency installation fails after switching operating systems

Delete `node_modules` only, then rerun:

```powershell
.\scripts\install-windows.ps1
```

Do not delete `pnpm-lock.yaml`; it is the reproducible dependency source.

## Roadmap

1. Real Claude Code hooks/status provider
2. SQLite-backed sessions, settings, predictions, and recommendation outcomes
3. Predictor calibration using predicted-versus-actual history
4. Optional Tauri desktop wrapper
5. Additional Codex, Gemini CLI, and OpenCode providers
6. Advisory multi-model routing, followed only later by opt-in automation

## Out of scope for this MVP

- automatic model switching;
- an LLM gateway or API proxy;
- cloud accounts or multi-user support;
- payments;
- remote source-code analysis;
- an ML-based task analyzer.