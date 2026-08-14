---
kind: decision
name: technical-decisions-phase-03-upload
phase: phase-03-upload
status: decided
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

This phase introduces the three infrastructure containers that were deliberately left "TBD/planned" in the architecture diagram: **Object Storage** (MinIO, S3-compatible), **Message Queue** (RabbitMQ), and the **Video Worker** (FFmpeg). The overarching constraint is the **strict-BFF** model established in `next-frontend-config-base` TD-03: the browser never calls the NestJS API directly, except for the pre-nominated exception — **video bytes go straight to object storage via presigned URLs**, never through the API/BFF. A 10GB video must not transit the NestJS or Next.js process.

## TD-01: Object Storage Target

**Context:** Phase 03 introduces persistence for video files and thumbnails. The architecture diagram names "S3 or MinIO". The choice determines the SDK, bucket lifecycle, presigned URL mechanics, and how unit/integration tests emulate storage. The project runs fully in Docker and is a course project — there is no AWS account.

### Option A: MinIO (self-hosted, S3-compatible) in Docker

Run MinIO as a Compose service. Use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` against a custom endpoint with `forcePathStyle: true`. The S3 API surface is identical to real AWS S3, so swapping to S3 in production is a config change (endpoint + credentials), not a code change.

- **Pros:** Free/local; real S3 wire protocol; presigned uploads work identically; testable in parallel with the codebase; no cloud credentials or cost. Matches the "S3-compatible" architecture note.
- **Cons:** Adds a Compose service; needs a bucket-bootstrap step (bucket + lifecycle).

**Required config caveat:** MinIO does not support virtual-hosted-style bucket addressing — `forcePathStyle: true` is mandatory, and every presigned URL inherits the custom endpoint.

### Option B: Real AWS S3
- **Pros:** production-ready out of the box.
- **Cons:** credentials, cost, network dependence in tests; no local dev parity. Not appropriate for a course greenfield on a shared machine.

**Recommendation:** **Option A (MinIO)** — S3-compatible protocol with zero infrastructure cost, keeping a clean production path (swap endpoint when deploying). Use the AWS v3 SDK so the storage layer is interchangeable.

## TD-02: Video Upload Mechanism (10GB)

**Context:** Videos up to 10GB must upload without blocking the system, be resumable across transient failures, and play via streaming without full download. The BFF model forbids large payloads transiting the Node processes.

### Option A: Browser multipart upload directly to MinIO via presigned URLs
Each upload is an S3 multipart upload. NestJS's video service initiates/aborts/completes the S3 multipart and hands the browser presigned URLs per part. The browser issues parallel `PUT` requests **directly to MinIO** (if different hosts, may need CORS), part-by-part with resumption. NestJS only coordinates metadata and never buffers video bytes.

- **Pros:** matches the pre-nominated BFF exception ("videos go direct to object storage"); true 10GB support; per-part retry; low memory/timeout risk in NestJS.
- **Cons:** more moving parts (initiate/presign-part/complete/abort + ETag handling); needs CORS on the storage host if presigned URLs point to a different host than the app.

### Option B: Synchronous upload through NestJS (streamed body)
- **Pros:** simpler single POST; no presigned orchestration.
- **Cons:** 10GB transits NestJS/Next BFF, invalidating the BFF storage exception; memory/stream pressure; long-lived connections. Disqualified.

**Recommendation:** **Option A** — The project plan explicitly calls for "upload de até 10GB sem travar o sistema" and **resumability**. Multipart presigned is the only option that keeps NestJS/BFF out of the data path and satisfies resumption.

## TD-03: Message Queue

**Context:** The architecture diagram leaves the queue as "TBD". The worker must consume video-processing jobs with retry/backoff and dead-lettering for corrupt files. The UI needs a queue broker discoverable in Docker.

### Option A: RabbitMQ 3.13 + `amqplib`
- Direct channel API; `assertQueue`/`consume`/`ack`/`nack(requeue=false)`; native dead-letter via `deadLetterExchange`; per-consumer `prefetch`. Runs as a Compose service; no Redis.
- **Cons:** storing broker directly with channels; slightly more boilerplate for a simple job queue (exchange/routing keys optional).

### Option B: BullMQ + Redis
- Redis-native job queue; Node-first; retries/backoff built-in.
- **Cons:** adds Redis as a service; heavier for a single worker type.

**Recommendation:** **Option A (RabbitMQ + amqplib)** — per user infra decision and to match the architecture diagram's "Message Queue ... RB" signal. RabbitMQ's nack/requeue semantics give explicit control over dead-lettering for failed video jobs.

## TD-04: Video Processing Toolchain (FFmpeg)

**Context:** processing must extract duration/metadata and generate a thumbnail without blocking the API. The toolchain runs in a separate `video-worker` container.

### Option A: `fluent-ffmpeg` npm wrapper + `ffprobe`
- The original fluent-ffmpeg is now **deprecated** ("no longer works properly with recent ffmpeg versions; repository readonly"). It bundles a legacy fork. Interfacing directly with the `ffmpeg`/`ffprobe` binaries via child-process wrappers (like `ffprobe-client`) avoids the deprecated layer.

### Option B: Direct `ffmpeg`/`ffprobe` binaries + `ffprobe-client` parsing
- Run ffprobe to read duration/resolution, run ffmpeg with `-ss <t> -frames:v 1` to extract a thumbnail frame; parse JSON output. Full control; current binaries; no deprecated wrapper.

**Recommendation:** **Option B** — pull the official `ffmpeg` image (or apt `ffmpeg`) into the worker container and drive the binaries via `child_process` + `ffprobe-client` for JSON metadata. Avoids the deprecated `fluent-ffmpeg` layer.

## TD-05: Unique Video Identifier (URL)

**Context:** each video needs a short, unique, non-conflicting URL.

### Option A: `nanoid` (e.g. 21-char)
- Short, URL-safe, collision-resistant without DB round-trips; used by YouTube-like platforms.

### Option B: UUID slug
- Longer; needs DB check; no advantage.

**Recommendation:** **Option A (nanoid)** — collision-resistant base64url id used as the video's unique `id`/URL key, avoiding DB lookup for uniqueness.

## TD-06: Streaming Strategy

**Context:** the video must start playing without downloading the whole file.

### Option A: Byte-range presigned streaming from MinIO
MinIO/S3 support HTTP `Range`; a presigned GET URL with `?partNumber=` handled by the front-end player; NestJS serves a thin `GET /videos/{id}/stream` that returns a presigned URL (or redirect) to the object, enabling byte-range playback.

**Recommendation:** **Option A** — MinIO natively honors `Range`, enabling progressive streaming; the `stream` endpoint just instruments the file and returns a short-lived presigned URL.

## Decisions Summary

| ID | Decision | Recommendation | Choice |
|----|----------|---------------|--------|
| TD-01 | Object Storage Target | MinIO (S3-compatible) | A (MinIO + SDK v3) |
| TD-02 | Upload 10GB | Multipart presigned, browser→MinIO | A (presigned multipart) |
| TD-03 | Message Queue | RabbitMQ + amqplib | A (RabbitMQ) |
| TD-04 | Video toolchain | Direct ffmpeg/ffprobe binaries | B (cli + ffprobe-client) |
| TD-05 | Unique video id | nanoid | A (nanoid) |
| TD-06 | Streaming | Range via presigned MinIO | A (presigned range) |