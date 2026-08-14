# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StreamTube — a video sharing platform (YouTube-like). Users can upload, manage, and publish videos. Anonymous users can watch freely; social features (comments, subscriptions, likes) require authentication.

More info in the project overview: [docs/project-plan.md](docs/project-plan.md). Detailed per-subproject guidance lives in `nestjs-project/CLAUDE.md` and `next-frontend/CLAUDE.md` — read those before working inside either subproject.

## Repository Structure

Monorepo with two independently-run Docker stacks plus documentation:

- `nestjs-project/` — Backend API (NestJS 11, TypeScript, Express, TypeORM, PostgreSQL). Owns its own stack: API + PostgreSQL + Mailpit + MinIO + RabbitMQ.
- `next-frontend/` — Frontend (Next.js 16, App Router + React Server Components) with its own separate Docker stack.
- `docs/` — Project planning (by phase), architecture (C4 Mermaid) and technical decisions.
- `scripts/` — cross-repo sync helpers (e.g. OpenAPI contract sync).
- `FC Tube.fig` — the Figma design system source / design reference for the frontend.

## Architecture (C4 Container Diagram)

See `docs/diagrams/software-arch.mermaid` for the full diagram. Key containers and data-flow:

- **Frontend** (Next.js) → calls the API only through same-origin BFF Route Handlers; streams video from Object Storage
- **API** (NestJS) → business rules, auth, DB reads/writes, orchestrates upload jobs (bytes never pass through it for video), publishes jobs to the queue, sends emails
- **Video Worker** (FFmpeg) → consumes jobs from RabbitMQ, extracts metadata/thumbnail, updates DB and storage
- **Database** (PostgreSQL 17) → users, channels, videos, tokens
- **Object Storage** (MinIO, S3-compatible) → video files and thumbnails
- **Message Queue** (RabbitMQ) → video processing job queue with a dead-letter queue
- **Email Service** (Mailpit in dev) → account confirmation and password recovery

### Video upload pipeline (Fase 03) — presigned multipart, bytes never hit the API

Uploads up to 10GB use **multipart presigned URLs**: the browser PUTs each part **directly to MinIO**; neither the BFF nor the API ever receives the video bytes (a deliberate exception to the strict BFF model). The API only hands out presigned URLs and tracks state.

1. `POST /videos/initiate-upload` (auth) → starts S3 multipart + creates the video as `draft` → returns `{ videoId, uploadId, partSize, partCount }`
2. Per part: `GET /videos/:id/presign-part?partNumber=N` (auth) → presigned URL; browser does `PUT` of the slice **directly to MinIO**
3. `POST /videos/:id/complete` (auth) → completes multipart, marks `processing`, publishes a job to the `video_processing` queue
4. **VideoWorkerService** (FFmpeg in the `nestjs-api` container) consumes the job: downloads source to `/tmp`, `ffprobe` extracts duration/resolution, `ffmpeg` generates a thumbnail, uploads it to MinIO, and marks the video `published|failed` with `thumbnailUrl`/`streamUrl`

Other endpoints: `POST /videos/:id/abort`, `GET /videos/:id/stream`, `GET /videos/:id/download`, `GET /videos/:id`. The phase-03 runbook ([docs/phases/phase-03-upload/runbook-execucao.md](docs/phases/phase-03-upload/runbook-execucao.md)) documents the full state machine, infra, and troubleshooting.

Backend module layout for video: `src/videos/` (controller/service/DTOs/`video-worker.service.ts`), `src/storage/` (MinIO S3 wrapper — presigned, download/upload), `src/rabbitmq/` (amqplib + DLQ), `src/config/queue.config.ts`, `src/config/storage.config.ts`. Infra services `minio`, `minio-setup` (creates the `streamtube-media` bucket), and `rabbitmq` are declared in `nestjs-project/compose.yaml`.

### Frontend BFF pattern

The browser **never** calls the NestJS API directly (no CORS, backend URL stays out of the client bundle). All client traffic goes through same-origin Route Handlers under `app/api/**`, which proxy server-side to the upstream API — this single integration surface is also what MSW fakes in tests. Client Components fetch only `fetch("/api/...")`; only Route Handlers / RSC read `env.API_URL` (server-only, validated in `lib/env.ts`). There is no `NEXT_PUBLIC_*` backend URL and must not be one.

**Wire shapes are never hand-duplicated on the frontend.** They derive from a committed OpenAPI spec: `openapi.json` → `lib/api/types.gen.ts` (generated) → typed `paths` surface. CI (`openapi-freshness.yml`) blocks merging stale spec/type pairs.

### Docker networking — use Compose service names, never localhost

This project runs entirely in Docker. Inside a container, `localhost` refers to the container itself, so **always** use the Compose service name as the host — never `localhost`/`127.0.0.1`. Correct: `DB_HOST=db`. Wrong: `DB_HOST=localhost`. Exception: the frontend and backend run as **separate Compose stacks**, so `next-frontend` reaches the API via `host.docker.internal:3002` (wired through `extra_hosts` in its compose file, `API_URL` in `.env.local`).

The two stacks are separate — bring up the backend first (API + DB + Mailpit + MinIO + RabbitMQ), run migrations, then the frontend. See the runbook for the full bring-up sequence.

## Commands

Both subprojects run everything **inside their own container**. Never run `npm`/`npx`/`tsc`/jest/vitest on the host for backend or frontend work — host execution diverges env vars, Node version, and results from CI. (Exception: Playwright E2E runs on the host, targeting the containerized dev server.) Full command reference is in each subproject's `CLAUDE.md`.

### Backend (`nestjs-project`)

```bash
cd nestjs-project
docker compose up -d                                 # infra: db, mailpit, minio(+setup), rabbitmq, api
docker compose exec nestjs-api npm install           # first time only
docker compose exec nestjs-api npm run migration:run # required — synchronize is disabled
docker compose exec nestjs-api npm run start:dev     # watch server (run in background — never exits)

# Quality gate / tests
docker compose exec nestjs-api npx tsc --noEmit                 # type-check
docker compose exec nestjs-api npm run lint                     # ESLint
docker compose exec nestjs-api npm test                         # unit tests
docker compose exec nestjs-api npm test -- path/to/file.spec.ts # run a single test file
docker compose exec nestjs-api npm run test:integration -- --runInBand   # real-DB integration
docker compose exec nestjs-api npm run test:e2e                 # HTTP e2e (supertest)
docker compose exec nestjs-api npm run test:cov                 # coverage
```

Integration + e2e suites share one test database and **must** run with `--runInBand` (parallel runs cause FK violations/deadlocks). Test suffixes are a contract that drives the Jest config: `*.spec.ts` = unit (no DB, collaborators mocked), `*.integration-spec.ts` = real DB/repositories, `*.e2e-spec.ts` = full HTTP via supertest.

Migrations (synchronize is off; always run migrations explicitly):

```bash
docker compose exec nestjs-api npm run migration:run    # apply
docker compose exec nestjs-api npm run migration:revert # undo
docker compose exec nestjs-api npm run migration:generate  # from entity changes
docker compose exec nestjs-api npm run migration:create    # blank migration
```

### Frontend (`next-frontend`)

```bash
cd next-frontend
docker compose up -d                                   # infra: just the next-frontend container
docker compose exec next-frontend npm install          # first time only
docker compose exec next-frontend npm run dev          # watch server (run in background)
curl -I http://localhost:3001                          # verify (expect 200)

docker compose exec next-frontend npx tsc --noEmit     # type-check
docker compose exec next-frontend npm run lint         # ESLint (eslint-config-next)
docker compose exec next-frontend npm test             # Vitest unit + integration
docker compose exec next-frontend npm test -- path/to/file.test.ts   # single test file
npx playwright test                                    # E2E — on HOST (see below)
```

Playwright E2E runs **on the host** (`npx playwright test`, against `http://localhost:3001`). Before it, the containerized dev server must be running with MSW enabled: `docker compose exec -d next-frontend sh -c "MSW_ENABLED=true npm run dev"`, then wait with `curl --retry 15 --retry-delay 2 --retry-connrefused -I http://localhost:3001`. Never add `webServer` to `playwright.config.ts`. Frontend test suffixes: `*.test.ts(x)` = unit, `*.integration.test.ts(x)` = Route Handlers called as functions with `msw/node` faking the upstream fetch, `*.e2e-spec.ts` = full browser flow (real `/api/**` run server-side, upstream faked via MSW). MSW is the fake API at both layers — tests never hit the real NestJS API.

### OpenAPI contract regeneration (when Docker is available)

`openapi.json` was hand-augmented for Fase 03 because Docker was unavailable; that working spec is **not canonical**. To regenerate the canonical spec and types:

```bash
cd nestjs-project && docker compose exec nestjs-api npm run openapi:export  # 1. backend exports spec
cd .. && bash scripts/sync-openapi.sh                                       # 2. sync to frontend
cd next-frontend && docker compose exec next-frontend npm run openapi:types # 3. regen types.gen.ts
cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit        # 4. verify
```

## Git Conventions

- **Main branch:** `main` — never commit directly to it
- **Workflow:** Git Flow. Branches: `feature/*`, `bugfix/*`, `hotfix/*`, `docs/*`; long-lived `main` (stable) and `dev` (integration). Feature branches start from `dev` and merge back into `dev`; `dev` merges into `main` when stable.
- **Commits:** short, descriptive messages focused on the "why" of the change.

## Definition of Done (Technical)

A change is only complete when **all** of the following pass in the affected subproject(s) — plus the root one if touched:

1. The relevant test suite passes (unit + integration + e2e affected by the change).
2. The full test suite passes before finishing the task.
3. TypeScript compiles cleanly: `npx tsc --noEmit` exits 0. Compilation errors must never be left as debt for future tasks.
4. Lint passes: `npm run lint`.

## Working Principles

- **Single Responsibility:** each module, service, and function has one clear responsibility. When a module starts owning logic or entities that aren't its own (e.g. a service creating an entity from another domain), extract it into the proper module immediately rather than deferring.
- **Type Safety:** strict TypeScript across all layers; use `import type` for type-only imports and `ConfigType<typeof x>` for typed `registerAs` configs.
- **Testing:** strong pyramid testing at all levels. During development run only tests related to the change; before finishing run the full suite.
- **Code Quality:** ESLint + Prettier. Reviews focus on readability, maintainability, adherence to best practices.
- **Documentation:** comprehensive docs for architecture, setup, and troubleshooting live in `docs/`. Each phase has a plan, context, decisions, and a runbook under `docs/phases/phase-0X/` and `docs/decisions/` — consult them before modifying a phase's code.

## Scope Limits

- Work on **one feature, fix, or refactoring at a time** — do not mix scopes.
- Do not include cosmetic changes (formatting, renaming) alongside functional changes.
- If something out of scope comes up, note it as a separate task rather than acting on it; create a new issue/task for necessary out-of-scope changes.

## Conventions Observed by Agents in this Repo

- **Skills:** decompose every task into subtasks and activate the matching skills (e.g. `nestjs-best-practices`, `next-best-practices`, `typeorm`, the per-subproject `testing-guide-*`, `artifact-design`). The available-skills listing is the source of truth.
- **Library documentation lookup:** before implementing a feature, use context7 to look up the relevant library APIs (verify the installed version against the manifest first); follow official docs over training data. Skip only for trivial operations. Flag it if the returned docs don't match the installed version.

## Known Environment Caveats

- **Docker is currently unavailable on this host** (`docker.service` masked; `sudo` needs a password). DB / integration / E2E tests and anything needing the stack cannot run. Use unit tests + `tsc` + lint as best-effort, and note what remains blocked. Full verification of Fase 03 backend and the openapi re-export require Docker to be available again (see the runbook).
- IDs are generated with `node:crypto` (nanoid@5 is ESM-only and breaks CJS/ts-jest) — keep using `node:crypto` in the backend.
