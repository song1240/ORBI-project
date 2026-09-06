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
6. creates the local `.model-pilot\logs` and `.model-pilot\data` directories.

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

## Commands

Run these commands from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm run dev:mock` | Start the mock API and live-reloading dashboard on ports 3792 and 3791 |
| `pnpm run build` | Typecheck the workspace, then build the Model Pilot API and dashboard |
| `pnpm run start` | Start previously built API and dashboard output locally |
| `pnpm run test` | Run tests provided by workspace packages |
| `pnpm run lint` | Run linters provided by workspace packages |
| `pnpm run typecheck` | Run the full TypeScript check |
| `pnpm run data:reset` | Reset local SQLite data while retaining a timestamped backup |

`pnpm run start` expects a successful build first. On Windows, `.\scripts\start-windows.ps1` is preferred because it can build missing output, opens the browser, records process identity, and provides a safe stop command.

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

The Vite build defaults to port 3791 and `/` for standalone commands. Replit workflows and the Windows launcher override those values explicitly:

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

Start Model Pilot, then install the local Claude Code bridge:

```powershell
pnpm run claude:setup
```

Restart Claude Code after setup. Model Pilot then merges supported lifecycle hooks with Claude Code's status-line data:

- session start and end;
- current model and session ID;
- user prompt submission;
- successful tool activity;
- context and cost when reported by Claude Code.

The setup command updates `%USERPROFILE%\.claude\settings.json` and creates a timestamped backup before writing. It preserves existing hooks and refuses to replace an existing custom status line. To replace one intentionally after reviewing it, run:

```powershell
pnpm run claude:setup -- --force-status-line
```

All bridge requests go to `127.0.0.1:3792`; the endpoint rejects non-local requests, browser-originated requests, and requests without the locally generated bridge token. The token stays under the Git-ignored `.model-pilot` runtime directory. Hook handlers run asynchronously and stay silent if Model Pilot is stopped. The status line continues to display the model, context percentage, and estimated Claude Code session cost while indicating whether Model Pilot is connected.

Real Claude Code data takes precedence whenever an active session is detected. Keep **Mock Mode** on to show demonstration data only when Claude Code is absent, or turn it off to show an explicit waiting state. Fields not supplied by supported Claude Code events are labeled unavailable rather than fabricated.

## Configuration

Pilot Settings currently exposes:

- coding-agent provider;
- dashboard port preference;
- context warning and critical thresholds;
- model switch threshold;
- telemetry;
- Mock Mode.

Settings are stored in the local SQLite database and survive API restarts. The Windows runtime ports are currently fixed to 3791 for the dashboard and 3792 for the API. Direct `pnpm` launches may override `DASHBOARD_PORT`, `API_PORT`, `LOCAL_API_PORT`, and `MODEL_PILOT_DATA_DIR`.

## Local data and recovery

Model Pilot stores its database at:

```text
.model-pilot\data\model-pilot.sqlite
```

`MODEL_PILOT_DATA_DIR` can override the containing directory for direct local launches. The database contains completed Claude Code sessions, projects, task analysis, token and cost predictions, recommendations, actual context/cost usage, and Pilot Settings. It does not contain API keys.

Stop Model Pilot before moving or resetting the database. To start again with empty settings and session history while retaining the old database as a timestamped backup:

```powershell
.\scripts\stop-windows.ps1
pnpm run data:reset
.\scripts\start-windows.ps1
```

Backups created by reset are kept under `.model-pilot\backups`; SQLite WAL, shared-memory, and rollback-journal sidecars are retained with the main database when present. If SQLite reports a corrupt database during startup, Model Pilot retains the complete original database file set beside it with a `.corrupt-<timestamp>` suffix, writes the recovery location to the API error log, and creates a fresh database. Lock, unknown migration-version, and other migration errors do not delete or replace the database; the API stops so the cause can be fixed safely.

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
2. Predictor calibration using predicted-versus-actual history
3. Optional Tauri desktop wrapper
4. Additional Codex, Gemini CLI, and OpenCode providers
5. Advisory multi-model routing, followed only later by opt-in automation

## Out of scope for this MVP

- automatic model switching;
- an LLM gateway or API proxy;
- cloud accounts or multi-user support;
- payments;
- remote source-code analysis;
- an ML-based task analyzer.