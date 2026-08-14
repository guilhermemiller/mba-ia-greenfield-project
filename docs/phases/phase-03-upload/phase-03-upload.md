---
kind: phase
name: phase-03-upload
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:57-03:00"
  docs/decisions/technical-decisions-phase-03-upload.md: "2026-06-01T10:00:00-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-05-12T12:23:19-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver the end-to-end video pipeline: **upload of files up to 10GB via multipart presigned URLs that bypass the API/BFF** (per the strict-BFF storage exception), **automatic background processing** (metadata extraction + thumbnail) via a RabbitMQ consumer and an FFmpeg worker, **unique video URLs**, and **byte-range streaming** — establishing the storage, queue, and worker foundation for all later phases.

---

## Step Implementations

### SI-03.1 — Infrastructure: Config Namespaces, Docker Compose, and Object Storage Bootstrap

**Description:** Install the storage/queue dependencies, create the `storage` and `queue` config namespaces following the `registerAs` pattern, extend the Joi validation schema, add MinIO + `minio/mc` + RabbitMQ to Docker Compose, install `ffmpeg`/`ffprobe` in the worker image, and bootstrap the MinIO bucket with a lifecycle policy.

**Technical actions:**

- Install production dependencies in `nestjs-project/`: `@aws-sdk/client-s3@^3`, `@aws-sdk/s3-request-presigner@^3`, `amqplib@^0.10`, `nanoid@^5`, `ffprobe-client@^1`; dev dep `@types/amqplib@^0.5`
- Create `src/config/storage.config.ts` — `registerAs('storage', ...)` reading `S3_ENDPOINT` (string, default `'http://minio:9000'`), `S3_REGION` (string, default `'us-east-1'`), `S3_ACCESS_KEY` (string, default `'streamtube'`), `S3_SECRET_KEY` (string, default `'streamtube'`), `S3_BUCKET` (string, default `'streamtube-media'`), `S3_PUBLIC_BASE_URL` (string, default `'http://localhost:9000/streamtube-media'`), `PRESIGNED_URL_EXPIRES` (number, default `3600`)
- Create `src/config/queue.config.ts` — `registerAs('queue', ...)` reading `RABBITMQ_URL` (string, default `'amqp://streamtube:streamtube@rabbitmq:5672'`), `VIDEO_PROCESSING_QUEUE` (string, default `'video_processing'`), `VIDEO_DEAD_LETTER_QUEUE` (string, default `'video_processing_dlq'`), `QUEUE_PREFETCH` (number, default `1`), `WORKER_FFMPEG_BIN` (string, default `'ffmpeg'`), `WORKER_FFPROBE_BIN` (string, default `'ffprobe'`), `THUMBNAIL_SIZE` (string, default `'1280x720'`), `THUMBNAIL_SEEK` (string, default `'00:00:01.000'`)
- Update `src/config/env.validation.ts` — add all new environment variables to the Joi schema (defaults, none required for local dev). Update `.env.example`
- Add MinIO service to `nestjs-project/compose.yaml` — image `minio/minio`, `server /data --console-address ":9001"`, ports `9000:9000` (S3) and `9001:9001` (console), credentials `STREAMTUBE`/`streamtube`, healthcheck on `/minio/health/live`. Add `minio/mc` init container that creates the `streamtube-media` bucket with a lifecycle policy (abort incomplete multipart uploads). Add `rabbitmq:3.13-management` service with management UI on `15672`
- Extend `nestjs-project/Dockerfile.dev` — install `ffmpeg` (Ubuntu package, brings `ffprobe`) so metadata extraction and thumbnail generation can run inside the API container for dev parity with the worker

**Dependencies:** None

**Acceptance criteria:**

- `docker compose up -d` brings up `minio`, `rabbitmq` and existing services without errors
- MinIO console reachable at `localhost:9001`; RabbitMQ management at `localhost:15672`
- `S3_BUCKET` (e.g. `streamtube-media`) is auto-created on startup
- Joi validation passes with only the existing `.env` values set; the app starts
- `node -e "require('ffmpeg')"` runs inside the API container (ffmpeg binary present)

---

### SI-03.2 — Videos Module: Entity, Migration, and Domain Exceptions

**Description:** Create the `videos` module with the `Video` entity, its database migration, and the Phase-03 domain exceptions, following the exact patterns from authentication/channels.

**Technical actions:**

- Create `src/videos/entities/video.entity.ts` — `@Entity('videos')`, `@PrimaryGeneratedColumn('identity')` numeric PK `id` (short unique URL), plus:
  - `channel_id uuid NOT NULL` FK to `channels`, `@ManyToOne(() => Channel, (channel) => channel.videos)` + `@JoinColumn({ name: 'channel_id' })`
  - `title varchar(255)`, `description text default ''`
  - `visibility` enum `('public','unlisted')` default `'public'`
  - `status` enum `('draft','processing','published','failed')` default `'draft'`
  - `storage_key varchar unique` (S3 object key, e.g. `videos/<nanoid>/source.mp4`)
  - `thumbnail_key varchar nullable`
  - `duration_seconds integer nullable`, `width integer nullable`, `height integer nullable`, `source_size bigint nullable`
  - `views_count integer default 0`
  - `upload_id varchar nullable` (S3 multipart upload id)
  - `created_at`, `updated_at` timestamps, `@CreateDateColumn`/`@UpdateDateColumn`
- Create `src/videos/dto/` DTOs: `InitiateUploadDto` (filename, content-type, size), `CompleteUploadDto` (parts: `{ partNumber, etag }[]`), `PublicVideoDto`/`VideoViewDto` serializers
- Create `src/common/exceptions/domain.exception.ts` additions (or a `videos.exception.ts`): `VideoNotFoundException` (404 `VIDEO_NOT_FOUND`), `VideoNotOwnedException` (403 `VIDEO_NOT_OWNED`), `VideoUploadAlreadyInitiatedException` (409 `VIDEO_UPLOAD_ALREADY_INITIATED`), `VideoUploadNotInitiatedException` (400 `VIDEO_UPLOAD_NOT_INITIATED`), `VideoUploadPartsIncompleteException` (400 `VIDEO_UPLOAD_PARTS_INCOMPLETE`), `VideoNotPublishedException` (404 `VIDEO_NOT_PUBLISHED`), `VideoProcessingException` (500 `VIDEO_PROCESSING_FAILED`)
- Generate migration `src/database/migrations/<ms>-CreateVideos.ts` registering the `videos` table, enums, indexes, and FK. Add `Video` to the `ALL_ENTITIES` array and `cleanAllTables` list in `src/test/create-test-data-source.ts`
- Create `src/videos/videos.module.ts` — `@Module({ imports: [TypeOrmModule.forFeature([Video]), ChannelsModule, RabbitmqModule], controllers: [VideosController], providers: [VideosService], exports: [TypeOrmModule, VideosService] })`

**Dependencies:** SI-03.1

**Acceptance criteria:**

- Migration applies cleanly against a fresh database
- `npx tsc --noEmit` passes
- Unit test for entity field shape

---

### SI-03.3 — Object Storage and RabbitMQ Services

**Description:** Create injectable service wrappers around the AWS S3 SDK and amqplib channel so domain code never touches raw SDK/amqplib, following the DI patterns in the repo.

**Technical actions:**

- Create `src/storage/storage.service.ts` — wraps a configured `S3Client` (minimal constructor accepting credentials/endpoint/region; `forcePathStyle: true`) with methods:
  - `initiateMultipartUpload(key): Promise<{ uploadId, presignedUrl? }>`
  - `createMultipartUpload(key): Promise<string>`
  - `createPresignedUploadPartUrl(key, uploadId, partNumber, expires): Promise<string>`
  - `createPresignedGetUrl(key, expires): Promise<string>` — for streaming/download, honoring the `S3_PUBLIC_BASE_URL` base
  - `abortMultipartUpload(key, uploadId)`
  - `completeMultipartUpload(key, uploadId, parts)` — completes then returns final key
  - `headObject(key)` — returns size/content-type
- Create `src/storage/storage.module.ts` — providers `StorageService`, exports it; `@Global()` optional
- Create `src/storage/storage.config.ts` in `src/config/`
- Create `src/rabbitmq/rabbitmq.service.ts` — manages a single amqplib connection & channel with reconnection backoff; exposes `publish(queue, message)` and `subscribe(queue, handler)` with `ack`/`nack(requeue=false)` per handler; configures the `video_processing` queue with `deadLetterExchange` → `video_processing_dlq`
- Create `src/rabbitmq/rabbitmq.module.ts` — `@Global()`, providers `RabbitmqService`, export it. Instantiate lazily at `.connect()` so start-up isn't blocked if the broker is down (with retry)
- Unit tests: `storage.service.spec.ts` (mock the S3Client commands), `rabbitmq.service.spec.ts` (mock amqp.connect)

**Dependencies: SI-03.1, SI-03.2**

**Acceptance criteria:**

- Storage methods produce presigned URLs with the MinIO endpoint and expirations
- RabbitMQ service asserts the dead-letter queue and prefetch

---

### SI-03.4 — Videos Controller: Upload Orchestration Endpoints

**Description:** HTTP endpoints that coordinate multipart upload without touching video bytes.

**Technical actions:** create `src/videos/videos.controller.ts` + `videos.service.ts`:

- `POST /videos/initiate-upload` (auth) — validates `{ filename, size }` (max 10GB, allowed extensions), generates `storage_key = videos/{nanoid}/source.mp4`, calls `storage.initiateMultipartUpload`, creates a `Video` row with `status='draft'`, returns `{ videoId, uploadId, presignedUrls?, partSize }`
- `GET /videos/:id/presign-part?partNumber=N` (auth) — returns a presigned PUT URL for that part; total part count derived from the video `size`
- `POST /videos/:id/complete` (auth) — body `{ parts: [{partNumber, etag}] }`; verifies all parts present, calls `storage.completeMultipartUpload`, updates `Video.source_size`, returns the final video id and thumbnail pending, and publishes the processing job to the queue
- `POST /videos/:id/abort` (auth) — aborts the S3 multipart and marks the video `failed`
- `GET /videos/:id/stream` (public) — instruments `VideoSource` metadata, returns a presigned GET URL (or a redirect) supporting `Range`; only for `published`/processing videos
- `GET /videos/:id/download` (public) — presigned GET URL with `Content-Disposition: attachment`

**Swagger:** every endpoint gets `@ApiOperation`, success `@ApiResponse`, and per predictable error an `@ApiResponse` with `getSchemaPath(ApiErrorEnvelope)`; public routes use `@Public()` and must not annotate `@ApiBearerAuth`.

**Tests:**

| File | Layer | Verifies |
|------|-------|----------|
| `src/videos/videos.service.spec.ts` | Unit | Orchestration logic with mocked StorageService and Video repo |
| `src/videos/videos.controller.e2e-spec.ts` | E2E | Full flow against real MinIO via supertest |

**Dependencies: SI-03.3, SI-03.2**

**Acceptance criteria:**

- A synthesized upload flow completes and yields a `published` video row
- Unauthorized calls to initiate/complete/abort return 401
- Non-owner calls return 403

---

### SI-03.5 — Video Worker: Queue Consumer + FFmpeg Transformer

**Description:** a separate `video-worker` container consumes `video_processing` jobs, downloads the source from MinIO, extracts duration/resolution with `ffprobe` (via `ffprobe-client`), generates a thumbnail frame with `ffmpeg`, uploads thumbnails to MinIO, updates the Video row to `published`, and publishes a "processing completed" event.

**Technical actions:**

- Create `src/video-worker/video-worker.module.ts` + `video-worker.service.ts` (or a standalone `video-worker.ts` entry) that:
  - subscribes to `video_processing` queue with `prefetch=QUEUE_PREFETCH`
  - for each job: `headObject` the source, download via the S3 client, run `ffmpeg -ss <thumbnailQuota> -i <source> -frames:v 1 -vf scale=... thumbnail.jpg`, read source via `ffprobe-client` to get `duration`/`width`/`height`
  - uploads the thumbnail to MinIO as `thumbnails/{nanoid}.jpg`
  - updates `Video`: `status='published'`, `duration`, `width`, `height`, `source_size`, `thumbnail_key`
  - `ack` on success; on failure `nack(requeue=false)` (goes to DLQ)
- If `ffmpeg`/`ffprobe` binaries are missing (e.g. unit test), log a clear error
- Unit test `video-worker.service.spec.ts` mocking `child_process` spawn and storage calls

**Dependencies: SI-03.4**

**Acceptance criteria:**

- A fake job completes end-to-end when binaries present
- Failure (corrupt file) nacks to the DLQ after retries

---

### SI-03.6 — Frontend: Upload Page (multipart via presigned, direct to MinIO)

**Frontend deliverables:** a server page and a client upload component that drives the multipart flow against the BFF and MinIO.

**Technical actions (frontend `next-frontend`):**

- `app/videos/upload/page.tsx` — server component (checks session via `getSession()`); renders the upload client component
- `components/videos/upload-form.tsx` — `"use client"`; RHF + Zod; on file select:
  1. calls `POST /api/videos/initiate-upload` (BFF) → `{ videoId, uploadId, size, partSize? }`
  2. splits the file into parts, for each part calls `GET /api/videos/{id}/presign-part?partNumber=N` (BFF) then `PUT` directly to MinIO presigned URL with `fetch(..., { method:'PUT', body: slice })`
  3. calls `POST /api/videos/{id}/complete` with the collected ETags
  Shows overall progress (percentage) + per-part panel with one-click resume for failed parts
- `app/api/videos/{initiate-upload,presign-part,complete,abort}/route.ts` — BFF Route Handlers proxying with `upstream`, using the sealed session for the Bearer token
- `mocks/handlers/videos.ts` + register in `mocks/handlers/index.ts`; `lib/api/contracts.ts` video aliases; regenerate `lib/api/types.gen.ts` via `openapi:types`
- `components/videos/__tests__/upload-form.wiring.test.tsx` (jsdom) and `app/api/videos/initiate-upload/__tests__/route.integration.test.ts` (MSW)
- Playwright `tests/videos-upload.e2e-spec.ts` driving the real `/api/**` handlers with reserved fixture tokens

**Dependencies: SI-03.4 (backend), Phase 02 frontend auth**

**Acceptance criteria:**

- Upload page requires login; anon sees the login CTA
- Progress reflects part completion; a failed part can be resumed
- E2E: a small fixture video uploads to `published`

---

## Definition of Done (technical)

1. Unit + integration + e2e tests for each new module pass.
2. Full test suite (backend + frontend) passes.
3. `npx tsc --noEmit` exits 0 (both subprojects).
4. `npm run lint` passes (both subprojects).
5. The 10GB-large-file upload requirement is met via presigned multipart (no video bytes transit NestJS/BFF).