---
kind: phase
name: phase-03-upload
status: in_progress
issue_count: 3
sources_mtime:
  docs/phases/phase-03-upload/context.md: "2026-08-06T00:00:00-03:00"
  docs/decisions/technical-decisions-phase-03-upload.md: "2026-08-06T00:00:00-03:00"
issues:
  - "nanoid@5 is pure ESM; breaks ts-jest CJS unit tests"
  - "Docker daemon unavailable on host — integration/E2E/external-system tests cannot run here"
  - "Pre-existing lint baseline failures in repo (channels.service.ts, test files) unrelated to this change"
advisories:
  - "ffmpeg/ffprobe must be present in the worker container (added to Dockerfile.dev)"
---

# phase-03-upload — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

### Dependency Gaps

_None resolved here — see issues._

### Inherited Constraint Conflicts

**Versioned dependency note:** TD-05 in `technical-decisions-phase-03-upload.md` recommends `nanoid@^5`. The installed `nanoid@5` is a pure-ESM package that fails under the project's CJS + `ts-jest` setup (`SyntaxError: Cannot use import statement outside a module`). The implementation therefore uses a small `crypto.randomBytes`-based id generator (`src/videos/video-id.util.ts`) instead, and the `nanoid` dependency was removed. TD-05's intent (never conflict, short ID), is preserved.

### Unresolved Open Questions

_None._

### UI Coverage Gaps

The upload UI (`SI-03.6`) is not yet implemented (backend-first sequencing).

## Resolved Issues

### nanoid@5 ESM incompatibility

Replaced with a `node:crypto`-based generator; unit tests pass, `tsc` clean. `nanoid` removed from `package.json`.

## Outstanding (blocked by Docker)

Integration and E2E suites (migrations apply, complete upload flow against real MinIO, queue round-trip) require the Docker stack. The daemon is not running on this host (`docker.service` is masked and `sudo` needs a password). These must be executed by the user:

```bash
cd nestjs-project
docker compose up -d            # brings up db, mailpit, minio, rabbitmq
docker compose exec nestjs-api npm run migration:run
docker compose exec nestjs-api npm run test:integration -- --runInBand
docker compose exec nestjs-api npm run test:e2e
```