# AGENTS.md

Keep this file brief and operational. Status and progress belong in IMPLEMENTATION_PLAN.md.

## Build & Run

- Start all workspace apps: `pnpm start` or `pnpm dev`
- Backend only: `pnpm --filter @know-grow/backend start`
- Frontend only: `pnpm --filter @know-grow/frontend start`

## Validation

- Tests: `pnpm -r test`
- Typecheck: `pnpm -r typecheck`
- Lint: `pnpm -r lint`
- Frontend production build: `pnpm --filter @know-grow/frontend build`

## Operational Notes

- Docker Compose v2 may be unavailable in this environment; legacy `docker-compose` works.
- Compose host ports can be overridden with `BACKEND_HOST_PORT`, `FRONTEND_HOST_PORT`, and `PI_AGENT_HOST_PORT`; when changing the backend host port, set `VITE_API_BASE_URL` too.
- Pi-agent mock mode is default; real CLI mode is opt-in with `PI_AGENT_MODE=real` plus optional `PI_CLI_COMMAND`, `PI_CLI_ARGS`, and `PI_CLI_TIMEOUT_MS` (compose passes these through).
- Add only durable commands and lessons that improve future Ralph iterations.
