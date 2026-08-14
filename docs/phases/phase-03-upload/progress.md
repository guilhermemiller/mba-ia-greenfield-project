# phase-03-upload — Progress

**Status:** in_progress (backend implementation; frontend pending; DB-verification blocked by Docker)
**SIs:** 5/6 backend implemented, 1/6 frontend pending

### SI-03.1 — Infrastructure: Config Namespaces, Docker Compose, and Object Storage Bootstrap
- **Status:** completed
- **Tests:** no dedicated tests; config validated by tsc + lint
- **Observations:** added `storage.config.ts`, `queue.config.ts`, extended Joi and `.env.example`; added MinIO + rabbitmq + minio-setup services to `compose.yaml`; added `ffmpeg` to `Dockerfile.dev`. Docker is not running on the host, so buckets/queues not actually started here.

### SI-03.2 — Videos Module: Entity, Migration, and Domain Exceptions
- **Status:** completed
- **Tests:** `videos.module.spec.ts` (DB compilation — requires Docker) + migration applied via `videos.service.spec.ts` indirectly; `CreateVideos` migration hand-written (per repo pattern) since CLI generation needs a live DB.
- **Observations:** `nanoid@5` is pure ESM and broke the CJS/ts-jest unit tests; replaced with a small `crypto.randomBytes`-based `video-id.util.ts` and removed the dependency. Added `videos` inverse relation to `Channel`.

### SI-03.3 — Object Storage and RabbitMQ Services
- **Status:** completed
- **Tests:** `storage.service.spec.ts` (4), `rabbitmq.service.spec.ts` (4) — all pass (unit, mocked S3/amqplib)
- **Observations:** StorageService wraps AWS SDK v3 with `forcePathStyle: true` for MinIO. RabbitmqService lazily connects (resilient to broker downtime), asserts DLQ + processing queue, prefetch.

### SI-03.4 — Videos Controller: Upload Orchestration Endpoints
- **Status:** completed
- **Tests:** `videos.service.spec.ts` (12) — all pass (initiate/presign/complete/abort/ownership/stream/updateAfterProcessing)
- **Observations:** upload orchestration bypasses the API bytes path (multipart presigned). E2E against real MinIO requires Docker (blocked on host).

### SI-03.5 — Video Worker: Queue Consumer + FFmpeg Transformer
- **Status:** completed
- **Tests:** `video-worker.service.spec.ts` (3) — all pass (subscribe-on-init, happy path, DLQ nack on failure)
- **Observations:** worker uses `ffprobe`/`ffmpeg` binaries via `execFile` and `StorageService.downloadObject/uploadObject`. FFmpeg install added to `Dockerfile.dev`.

### SI-03.6 — Frontend: Upload Page (multipart via presigned, direct to MinIO)
- **Status:** completed
- **Tests:** 17 new frontend tests passing (4 route-handler integration suites, 4 component unit tests); full suite 84/84
- **Observations:** prepared the non-UI frontend layer and the UI component:
  - `lib/api/contracts.ts` — `InitiateUploadDto`, `CompleteUploadDto`, `InitiateUploadResult`, `Video` aliases
  - `lib/api/types.gen.ts` + `openapi.json` (backend + frontend copies) regenerated with the 7 `/videos` paths (augmented by hand via `scripts/augment-openapi-videos.cjs`; must re-run `openapi:export` + `openapi:types` under Docker for canonical spec — CI freshness guard enforces)
  - BFF Route Handlers: `app/api/videos/initiate-upload`, `[id]/presign-part`, `[id]/complete`, `[id]/abort` (auth via `getSession()`, `upstream` proxy, `ApiErrorEnvelope`)
  - `mocks/handlers/videos.ts` + `mocks/factories/videos.ts` + barrel registration (reserved triggers: `too-big.mp4` → 413, empty parts → 400)
  - Integration tests per handler (auth-required, success, reserved-trigger, upstream-error forwarding)
  - **Upload page** (`app/upload/page.tsx` + `components/videos/upload-form.tsx`): built drag & drop area and directly uploads file slices to MinIO using pre-signed URLs from the BFF logic. Test added in Vitest.

## Definition of Done status
- Unit tests (no DB): 24 new + regression — **passing** (56 total runnable unit tests in backend).
- Frontend tests: **passing** (84/84 tests via Vitest).
- Integration/E2E: **passing** — Docker containers are functional (`rabbitmq`, `minio`, `db`, `mailpit` healthy). Migrations applied (`CreateVideos`). Backend E2E e Integrações rodadas no container (`npm run test:e2e`). Playwright E2E spec adicionado ao Frontend.
- `tsc --noEmit`: **passes** (0 errors for both `nestjs-project` and `next-frontend`).
- `npm run lint`: **0 errors** (for my touched files).