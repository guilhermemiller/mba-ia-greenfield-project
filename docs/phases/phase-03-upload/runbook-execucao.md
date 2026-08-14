# Runbook — Execução da Fase 03 (Upload e Processamento de Vídeos)

Guia de execução, verificação e troubleshooting da Fase 03 do StreamTube.
Cobre o que foi implementado (backend + frontend BFF/mocks), como subir o ambiente,
rodar as verificações pendentes (bloqueadas por Docker) e o fluxo de upload de ponta a ponta.

**Status da fase:** 🔶 Em progresso — backend ✅ · frontend BFF/contratos/mocks ✅ · página de upload pendente · validação E2E pendente.

---

## 0. Estado atual e o que falta

| Camada | Status | Detalhe |
|--------|--------|---------|
| Backend (infra: MinIO, RabbitMQ, FFmpeg worker) | ✅ | configs, compose, módulos |
| Vídeos: upload multipart presigned, streaming | ✅ | `VideosModule` + `StorageModule` + `RabbitmqModule` |
| Backend testes unitários | ✅ | 24 na máquina host |
| Backend testes integração/E2E + migração | ⏳ | requer Docker |
| Frontend contratos + BFF + mocks MSW | ✅ | verificado (80/80 testes) |
| Frontend página de upload | ⏳ | pendente |
| OpenAPI canônico (re-export) | ⚠️ | augumentado à mão; reexportar no Docker |

**Bloqueio:** o serviço Docker está desabilitado nesta máquina (`docker.service` masked; `sudo` exige senha).
Tudo que precisa do stack (DB, MinIO, RabbitMQ, Mailpit, containers `nestjs-api`/`next-frontend`) só roda quando o Docker estiver disponível.

---

## 1. Pré-requisitos

- Docker e Docker Compose (necessário para subir o stack e rodar testes de integração/E2E e migração)
- Node.js ≥ v25 (host — para Playwright E2E e scripts de sync)
- npm

---

## 2. Subir o ambiente (Docker)

O backend tem sua própria stack. Suba primeiro o backend, rode migrations, depois o frontend.

### 2.1 Backend (NestJS + PostgreSQL + Mailpit + MinIO + RabbitMQ)

```bash
cd nestjs-project

# Sobe todos os serviços (db, mailpit, minio, minio-setup, rabbitmq, nestjs-api)
docker compose up -d

# Confirma que subiram (o minio-setup cria o bucket streamtube-media e sai)
docker compose ps

# Instala dependências (apenas na primeira vez)
docker compose exec nestjs-api npm install

# Cria o schema do banco (obrigatório — synchronize está desabilitado)
docker compose exec nestjs-api npm run migration:run

# Sobe o servidor de desenvolvimento em watch mode (em background, não sai)
docker compose exec -d nestjs-api npm run start:dev
```

Serviços disponíveis:

| Serviço | URL / Porta |
|---------|-------------|
| API NestJS | http://localhost:3002 |
| PostgreSQL | `localhost:5432` (streamtube/streamtube/streamtube) |
| Mailpit (UI e-mails) | http://localhost:8025 |
| MinIO API | `localhost:9000` |
| MinIO Console | http://localhost:9001 (user/senha `streamtube`/`streamtube`) |
| RabbitMQ AMQP | `localhost:5672` |
| RabbitMQ Management | http://localhost:15672 (streamtube/streamtube) |
| Swagger (opcional) | http://localhost:3002/api/docs — com `SWAGGER_ENABLED=true` |

### 2.2 Frontend (Next.js)

```bash
cd next-frontend

# Garanta que o .env.local existe (veja .env.example); API_URL aponta p/ o backend,
# SESSION_PASSWORD protege a sessão (iron-session)
docker compose up -d
docker compose exec next-frontend npm install    # apenas na primeira vez
docker compose exec -d next-frontend npm run dev
```

App disponível em **http://localhost:3001** (acessa o backend via `host.docker.internal:3002`).

---

## 3. Verificações pendentes (bloqueadas por Docker — rodar quando o stack subir)

### 3.1 Aplicar a migração de vídeos

```bash
cd nestjs-project
docker compose exec nestjs-api npm run migration:run
# revert (se necessário):
docker compose exec nestjs-api npm run migration:revert
```

A migração `CreateVideos1780000000000` cria a tabela `videos` (id nanoid-compatible via `node:crypto`,
`channel_id` FK para `channels`, enums `visibility`/`status`, `storage_key` único, índices e FK).

### 3.2 Testes de integração + E2E do backend

```bash
cd nestjs-project
# Integração (bancos reais) — sempre com --runInBand (suites compartilham o mesmo DB)
docker compose exec nestjs-api npm run test:integration -- --runInBand
# E2E (HTTP via supertest)
docker compose exec nestjs-api npm run test:e2e
# Unitários + integração
docker compose exec nestjs-api npm test -- --runInBand
# Cobertura
docker compose exec nestjs-api npm run test:cov
```

> Unitários que não usam banco rodam no host (sem Docker): `npx jest src/videos src/storage src/rabbitmq --runInBand`.

### 3.3 Testes do frontend (Vitest + MSW)

```bash
cd next-frontend
docker compose exec next-frontend npm test            # unit + integration (MSW)
npx playwright test                                   # E2E — no HOST, com dev server em MSW_ENABLED=true
```

Para o E2E do upload (página ainda não implementada, ver seção 5), a sequência é:

```bash
docker compose exec -d next-frontend sh -c "MSW_ENABLED=true npm run dev"
curl --retry 15 --retry-delay 2 --retry-connrefused -I http://localhost:3001
npx playwright test tests/videos-upload.e2e-spec.ts
```

### 3.4 Gate de qualidade (antes de declarar pronto)

```bash
# Backend
docker compose exec nestjs-api npx tsc --noEmit       # 0 erros
docker compose exec nestjs-api npm run lint           # exit 0

# Frontend
docker compose exec next-frontend npx tsc --noEmit    # 0 erros
docker compose exec next-frontend npm run lint        # exit 0
```

---

## 4. Regenerar o OpenAPI/contract (spec canônico)

Durante a implementação sem Docker, o spec foi **augmentado à mão** via
`scripts/augment-openapi-videos.cjs` (adiciona os 7 endpoints `/videos`). Esse spec de
volta-de-obra não é o canônico — o fluxo oficial regera a partir do app NestJS ativo.

**Quando o Docker estiver disponível, reexportar o spec canônico e regenerar os tipos:**

```bash
# 1. Backend exporta o openapi.json (precisa do app + DB rodando)
cd nestjs-project
docker compose exec nestjs-api npm run openapi:export
# gera/atualiza nestjs-project/openapi.json

# 2. Sincroniza para o frontend (script na raiz, host)
cd .. && bash scripts/sync-openapi.sh

# 3. Frontend regera os tipos a partir do spec
cd next-frontend
docker compose exec next-frontend npm run openapi:types

# 4. Garante consistência (tsc)
docker compose exec next-frontend npx tsc --noEmit
```

> O CI `.github/workflows/openapi-freshness.yml` re-executa os passos 1–3 e bloqueia o merge se
> `openapi.json`/`types.gen.ts` divergirem. Confirme que a reexportação canônica bate com o
> augment à mão (mesmos paths/schemas).

---

## 5. Fluxo de Upload da Fase 03 (de ponta a ponta)

O upload de até 10GB usa **multipart presigned** — o browser sobe as partes
**diretamente ao MinIO** via URLs presignadas; a API/BFF nunca recebe os bytes do vídeo.

### Endpoints da API (`nestjs-project`)

| Método & Rota | Descrição | Auth |
|---------------|-----------|------|
| `POST /videos/initiate-upload` | Inicia multipart S3 + cria vídeo como rascunho (`draft`) | sim |
| `GET /videos/:id/presign-part?partNumber=N` | URL presigned para enviar a parte N | sim |
| `POST /videos/:id/complete` | Completa multipart e publica job na fila (`processing`) | sim |
| `POST /videos/:id/abort` | Aborta upload em andamento (`failed`) | sim |
| `GET /videos/:id/stream` | URL de streaming (Range) do vídeo publicado | público |
| `GET /videos/:id/download` | URL presigned de download | público |
| `GET /videos/:id` | View público do vídeo | público |

### Route Handlers BFF (frontend)

`app/api/videos/initiate-upload`, `[id]/presign-part`, `[id]/complete`, `[id]/abort`
— proxy same-origin via `upstream` (openapi-fetch), auth via `getSession()`, erro `ApiErrorEnvelope`.

### Fluxo no navegador (browser) — o que a página de upload fará (SI-03.6, pendente)

1. `POST /api/videos/initiate-upload` (BFF) → `{ videoId, uploadId, partSize, partCount }`
2. Para cada parte: `GET /api/videos/{id}/presign-part?partNumber=N` (BFF) → URL presigned,
   depois `PUT` da parte **direto ao MinIO** com `fetch(url, { method: "PUT", body: slice })`
3. `POST /api/videos/{id}/complete` (BFF) com os ETags das partes → vídeo vira `processing`
4. O **Worker** (FFmpeg) consome o job da fila, extrai duração/resolução, gera a thumbnail
   e publica → `published|failed` com `thumbnailUrl`/`streamUrl`

---

## 6. Verificar o Worker de vídeo (opcional)

Após um `complete`, um job é publicado na fila `video_processing` (RabbitMQ).
O `VideoWorkerService` (no container `nestjs-api`; `ffmpeg` instalado no `Dockerfile.dev`)
consome o job:

1. Baixa o source do MinIO p/ `/tmp`
2. `ffprobe` extrai duração/resolução
3. `ffmpeg -ss <seek> -frames:v 1` gera o thumbnail
4. Envia o thumbnail ao MinIO (`thumbnails/{id}/thumb.jpg`)
5. Atualiza o `Video` para `published` com metadados + thumbnail

OBS.: a `ffmpeg` precisa estar presente no container rodando o worker
(adicionado no `Dockerfile.dev`). Se faltar, o job vai para a DLQ (`video_processing_dlq`).

---

## 7. Documentos relacionados

- `docs/project-plan.md` — planejamento geral (Fases 01–07)
- `docs/phases/phase-03-upload/phase-03-upload.md` — plano da fase (SIs)
- `docs/phases/phase-03-upload/context.md` — escopo, decisões, convenções
- `docs/phases/phase-03-upload/progress.md` — status por SI
- `docs/phases/phase-03-upload/validation.md` — findings e bloqueios
- `docs/decisions/technical-decisions-phase-03-upload.md` — decisões técnicas (TD-01…TD-06)
- `README.md` — visão geral, arquitetura, stack