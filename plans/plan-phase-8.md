# Phase 8: Documentation + Dockerize

## Goal
Create production-ready documentation (prompts.md, run.md, Instructions.md) and Dockerize the application so the entire stack runs with a single `docker compose up` command.

## Documentation Checklist

| File             | Purpose                                           | Status   |
|------------------|---------------------------------------------------|----------|
| `prompts.md`     | All prompts, decisions, generated files, fixes     | Generate |
| `Instructions.md`| Phase log + setup summary                          | Generate |
| `run.md`         | How to build and run (Docker + manual)             | Generate |
| `CLAUDE.md`      | Project instructions for Claude Code               | Verify   |
| `README.md`      | Project overview                                   | Update   |

## Dockerfile Design

```
Stage 1: Build
  - FROM node:20-alpine
  - COPY package*.json -> npm install
  - COPY src/ tsconfig* -> npm run build

Stage 2: Production
  - FROM node:20-alpine
  - COPY --from=build dist/ + node_modules/
  - CMD ["node", "dist/main.js"]
```

**Why multi-stage:** Keeps the production image small — no TypeScript compiler, no devDependencies, no source files.

## Docker Compose Changes

| Service | Image           | Port | Healthcheck              |
|---------|-----------------|------|--------------------------|
| db      | postgres:16     | 5432 | `pg_isready`             |
| app     | (build: .)      | 3000 | depends_on db (healthy)  |

## Key Design Decisions
- **`DB_HOST: db`** — containers use Docker internal DNS, not localhost
- **`depends_on` with `condition: service_healthy`** — app waits for Postgres readiness, not just container start
- **`.dockerignore`** — excludes node_modules, dist, .git, uploads, graphify-out, .claude to keep build context small
- **`synchronize: true`** — acceptable for assignment; TypeORM auto-creates tables on startup

## Dependencies on Other Phases
- All phases (1-7) must be complete — documentation captures the full build history

## Risks & Edge Cases
- `npm run build` failure in Docker — TypeScript compilation errors would break the image build
- Port 3000 conflict if another service is running locally
- Docker Desktop must be running on macOS for `docker compose up`
