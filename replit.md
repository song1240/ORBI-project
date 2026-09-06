# Model Pilot

A local-first AI resource meter and model advisor for coding agents.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/model-pilot run dev` — run the Model Pilot dashboard through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/model-pilot/` — React dashboard with Live, Sessions, and Settings screens
- `artifacts/api-server/src/model-pilot/` — local analysis, prediction, recommendation, and provider logic
- `artifacts/api-server/src/routes/pilot.ts` — Model Pilot API routes
- `lib/api-spec/openapi.yaml` — API contract and generated client source of truth

## Architecture decisions

- Actual values and estimates are separate API objects and UI regions.
- Task analysis, prediction, and recommendation remain server-side and provider-independent.
- The first runnable build uses a simulated provider with evolving context and cost.
- Automatic model switching remains out of scope; recommendations are advisory.

## Product

Model Pilot displays the current model, context pressure, session cost, task complexity, token/cost prediction bands, recommendation, recent activity, session history, and local privacy settings.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Prediction confidence values are whole percentages (for example `72`), not decimal fractions.
- Replit workflows provide `PORT` and `BASE_PATH`; standalone local runs default to port 3791 and `/`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
