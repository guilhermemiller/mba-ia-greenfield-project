---
kind: phase
name: phase-03-upload
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:57-03:00"
  docs/decisions/technical-decisions-phase-03-upload.md: "2026-06-01T10:00:00-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-05-12T12:23:19-03:00"
---

# phase-03-upload — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities**

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** Edição de metadados do vídeo, categorias, visibilidade public/unlisted e painel de canal — diferidos para Fase 04. Interações sociais (likes/comentários/inscrições) — Fase 06.

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo (duração + thumbnail), streaming funcionando, URLs únicas geradas.

**Affected subprojects:** `nestjs-project/`, `next-frontend/` (página de upload).

**Deferred subprojects:** — (upload page UIs are part of this phase; video management/visibility UI is deferred to Fase 04).

**Sequencing notes:** Depends on Fase 02 (autenticação) — endpoints de upload são protegidos por JWT. Reuses the strict-BFF storage exception from `next-frontend-config-base` TD-03 (videos go directly to object storage via presigned URLs).

**Neighbors (for boundary detection only):** Fase 02 (prior), Fase 04 — Gerenciamento de Vídeos e Canal (next).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-upload/TD-01 | technical-decisions-phase-03-upload.md | Backend | Object Storage Target | decided | A (MinIO + SDK v3) | @aws-sdk/client-s3@^3, @aws-sdk/s3-request-presigner@^3 |
| phase-03-upload/TD-02 | technical-decisions-phase-03-upload.md | Frontend+Backend | Upload 10GB | decided | A (Multipart presigned, browser→MinIO) | @aws-sdk/s3-request-presigner@^3 |
| phase-03-upload/TD-03 | technical-decisions-phase-03-upload.md | Backend | Message Queue | decided | A (RabbitMQ) | amqplib@^0.10 |
| phase-03-upload/TD-04 | technical-decisions-phase-03-upload.md | Backend | Video toolchain | decided | B (Direct ffmpeg/ffprobe binaries) | ffprobe-client@^1 |
| phase-03-upload/TD-05 | technical-decisions-phase-03-upload.md | Backend | Unique video id | decided | A (nanoid) | nanoid@^5 |
| phase-03-upload/TD-06 | technical-decisions-phase-03-upload.md | Backend | Streaming | decided | A (Range via presigned MinIO) | — |

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-upload/TD-01 |
| Serviço de processamento em segundo plano (filas) | phase-03-upload/TD-03 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-upload/TD-02 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-upload/TD-02, phase-03-upload/TD-05 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-upload/TD-04 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-upload/TD-04 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-upload/TD-05 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-upload/TD-06 |
| Download do vídeo pelo usuário | phase-03-upload/TD-01, phase-03-upload/TD-06 |

## Decisions Detail

### phase-03-upload/TD-01

**Recommendation:** MinIO (S3-compatible) via the AWS v3 SDK — free/local with a production-ready upgrade path (swap endpoint for AWS S3). `forcePathStyle: true` is mandatory. It matches the architecture diagram's "S3 or MinIO".

**Decision:** A (MinIO + SDK v3)

### phase-03-upload/TD-02

**Recommendation:** Presigned multipart upload, browser → MinIO directly — avoids transiting the NestJS/Next BFF, supports 10GB and per-part resumption. This concretizes the pre-nominated storage exception in `next-config-frontend/TD-03` ("videos go direct via object storage").

**Decision:** A (Presigned multipart, browser→MinIO)

### phase-03-upload/TD-03

**Recommendation:** RabbitMQ + amqplib, channel-based with `nack(requeue=false)` to a dead-letter queue — chosen to satisfy the architecture's "Message Queue ... TBD" with explicit dead-lettering for failed video processing.

**Decision:** A (RabbitMQ + amqplib)

### phase-03-upload/TD-04

**Recommendation:** Drive the `ffmpeg`/`ffprobe` binaries directly via child_process + `ffprobe-client` for JSON metadata — `fluent-ffmpeg` is deprecated ("no longer works properly with recent ffmpeg versions"), so the worker avoids it and uses current binaries.

**Decision:** B (Direct ffmpeg/ffprobe binaries)

### phase-03-upload/TD-05

**Recommendation:** `nanoid` base64url for the unique video URL key — collision-resistant, short, no DB round-trip for uniqueness.

**Decision:** A (nanoid)

### phase-03-upload/TD-06

**Recommendation:** Byte-range streaming from MinIO via presigned GET URLs — MinIO honors HTTP `Range` natively, so the `/stream` endpoint instruments the file and returns a short-lived presigned URL; the player streams progressively.

**Decision:** A (Range via presigned MinIO)

_Source files:_ `docs/decisions/technical-decisions-phase-03-upload.md`

## Inherited Decisions Detail (from prior phases)

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — machine-readable error codes the frontend switches on; simple `{ statusCode, error, message }` envelope. Reused for all video domain errors.

### phase-02-auth/TD-02 / TD-06

**Recommendation:** `@nestjs/jwt` + guards and `class-validator` + `class-transformer` — reused for the protected upload endpoints and their DTOs.

### phase-01-configuracao-base/TD-01..04

**Recommendation:** `@nestjs/config` namespaced `registerAs`, Joi validation, `ConfigType`/`@Inject(KEY)` injection — followed by the new `storage.config.ts` and `queue.config.ts`.

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`. _(from phase 01)_
- Config injected via `ConfigType<typeof xxxConfig>` + `@Inject(xxxConfig.KEY)`. _(from phase 01)_
- `TypeOrmModule.forRootAsync` with `autoLoadEntities: true`, `synchronize: false`; migrations hand-written in `src/database/migrations/<ms>-Name.ts`. _(from phase 1/2)_
- Entities: UUID PKs, snake_case columns, `@CreateDateColumn`/`@UpdateDateColumn`, explicit column types, relations with `@JoinColumn`. _(from phase 2)
- Controllers: `@ApiTags`, `@ApiOperation`, `@ApiResponse` with `getSchemaPath(ApiErrorEnvelope)`, `@Public()` for public routes, `@CurrentUser() user: JwtPayload` for auth, no try/catch. _(from phase 2)
- Domain errors use `DomainException` subclasses (`{ statusCode, error, message }`) thrown from services. _(from phase 2)_
- Migrations tested via `createTestDataSource`; integration tests add entities to `ALL_ENTITIES` and `cleanAllTables`. _(from phase 2)_
- Frontend BFF: Route Handlers proxy via `upstream` (openapi-fetch); only `lib/api/contracts.ts` imports `paths`; `getSession()` checks auth; MSW handlers per domain; response shapes derived from generated contracts. _(from phase-02 frontend BFF)

## Inherited Deferred Capabilities

_No inherited deferred capabilities._

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Edição de metadados, categorias, visibilidade public/unlisted e painel do canal | deferred | Fase 04 — Gerenciamento de Vídeos e Canal. | — |
| Interações sociais (likes, comentários, inscrições) | deferred | Fase 06. | — |
| Página de visualização do vídeo (player, sugestões) | deferred | Fase 05. | — |

## Testing Requirements

Refer to the `testing-guide-nestjs-project` and `testing-guide-next-frontend` Skills for layer requirements per artifact type. The new `storage`, `rabbitmq`, `videos`, and `video-worker` modules are exercised at unit, integration, and E2E layers per the pyramid, and the frontend upload page/BFF handlers are covered by Vitest (MSW) + React + Playwright. Specific layer coverage by SI is recorded in `progress.md`.