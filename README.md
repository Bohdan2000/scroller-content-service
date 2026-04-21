# Content Service

Manages the full video lifecycle for the Scroller platform — from initial creation through Mux upload, processing, and publication.

## Port

`3003`

## Responsibilities

- Create and manage video records (metadata + status machine)
- Issue Mux direct upload URLs so clients upload directly to Mux (no file upload through the API)
- Handle Mux webhook events: asset created → processing → ready → failed
- Enforce a strict video status machine (DRAFT → UPLOADING → PROCESSING → READY → PUBLISHED)
- Publish `video.published` and `video.deleted` domain events to RabbitMQ

---

## Video status machine

```
DRAFT ──► UPLOADING ──► PROCESSING ──► READY ──► PUBLISHED
                                          │            │
                                          └──────────────► (unpublish back to READY)
           FAILED ◄─ (any stage can fail)
```

| Status | Meaning |
|---|---|
| `DRAFT` | Created, no upload started |
| `UPLOADING` | Upload URL issued, waiting for Mux |
| `PROCESSING` | Mux received the file, encoding in progress |
| `READY` | Mux processing complete, video can be published |
| `PUBLISHED` | Live in feeds |
| `FAILED` | Upload cancelled or Mux processing error |

---

## Mux upload flow

```
Client            API Gateway          Content Service          Mux
  │                    │                      │                   │
  │── POST /videos ───►│──────────────────────►│                   │
  │                    │                      │── createDirectUpload()
  │                    │                      │◄─ { uploadId, uploadUrl }
  │◄── { uploadUrl } ──│◄─────────────────────│                   │
  │                    │                      │                   │
  │─────────── PUT video file directly to uploadUrl ─────────────►│
  │                    │                      │                   │
  │                    │                      │◄── webhook: video.upload.asset_created
  │                    │                      │◄── webhook: video.asset.ready
  │                    │                      │ (video status → READY)
  │── POST /videos/:id/publish ──────────────►│                   │
  │                    │                      │── video.published ──► RabbitMQ
```

---

## Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A [Mux](https://www.mux.com/) account with API credentials
- RabbitMQ (shared with other services)

### 1. Environment variables

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default `3003`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Yes | Must match identity-service exactly |
| `MUX_TOKEN_ID` | Yes | Mux API token ID |
| `MUX_TOKEN_SECRET` | Yes | Mux API token secret |
| `MUX_WEBHOOK_SECRET` | Yes | Mux webhook signing secret (from Mux dashboard) |
| `CORS_ORIGIN` | No | CORS origin for Mux direct uploads (default `http://localhost:3000`) |
| `RABBITMQ_URL` | No | RabbitMQ AMQP URL (default `amqp://guest:guest@localhost:5672`) |

### 2. Start dependencies

```bash
docker compose up postgres rabbitmq -d
```

### 3. Run migrations

```bash
npx prisma migrate deploy
```

### 4. Start the service

```bash
# Development
npm run start:dev

# Production
npm run build && npm start
```

### 5. Mux webhooks (local development)

Use [ngrok](https://ngrok.com/) to expose your local service:

```bash
ngrok http 3000  # expose the API gateway
```

In the Mux dashboard set your webhook URL to:
```
https://<ngrok-id>.ngrok-free.app/api/v1/webhooks/mux
```

### 6. Docker (full stack)

```bash
JWT_ACCESS_SECRET=<secret> \
MUX_TOKEN_ID=<id> \
MUX_TOKEN_SECRET=<secret> \
MUX_WEBHOOK_SECRET=<webhook-secret> \
docker compose up --build
```

---

## API reference

All endpoints require `Authorization: Bearer <token>` unless noted.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Health check |
| `POST` | `/api/v1/videos` | JWT | Create a new video (DRAFT) |
| `GET` | `/api/v1/videos/:id` | Public | Get video by ID |
| `PATCH` | `/api/v1/videos/:id` | JWT | Update video metadata |
| `DELETE` | `/api/v1/videos/:id` | JWT | Delete a video |
| `POST` | `/api/v1/videos/:id/upload-url` | JWT | Request a Mux direct upload URL |
| `POST` | `/api/v1/videos/:id/publish` | JWT | Publish a READY video |
| `POST` | `/api/v1/videos/:id/unpublish` | JWT | Unpublish (PUBLISHED → READY) |
| `GET` | `/api/v1/me/videos` | JWT | List own videos |
| `POST` | `/api/v1/webhooks/mux` | Mux signature | Receive Mux webhook events |

Swagger UI: `http://localhost:3003/api/v1/docs`

---

## Webhook events handled

| Mux event | Action |
|---|---|
| `video.upload.asset_created` | Link Mux asset to video, transition → PROCESSING |
| `video.asset.ready` | Store playback ID + duration, transition → READY |
| `video.asset.errored` | Store error message, transition → FAILED |
| `video.upload.cancelled` | Transition → FAILED |

Webhook requests are verified using Mux's HMAC signature before processing.

---

## RabbitMQ events emitted

Exchange: `scroller.topic` (topic exchange)

| Routing key | Trigger | Payload |
|---|---|---|
| `video.published` | `POST /videos/:id/publish` | `{ videoId, authorUserId, title, topicIds, visibility, publishedAt }` |
| `video.unpublished` | `POST /videos/:id/unpublish` | `{ videoId, authorUserId }` |
| `video.deleted` | `DELETE /videos/:id` | `{ videoId, authorUserId }` |

Feed service consumes `video.published` and `video.deleted` to maintain its local topic index.

---

## Error codes

| Code | Status | Description |
|---|---|---|
| `CONTENT_001` | 404 | Video not found |
| `CONTENT_002` | 403 | Not the video owner |
| `CONTENT_003` | 409 | Video already published |
| `CONTENT_004` | 409 | Video already in draft/unpublished state |
| `CONTENT_005` | 422 | Video not ready to publish |
| `CONTENT_006` | 422 | Invalid status transition |
| `CONTENT_007` | 409 | Upload URL already issued |
| `CONTENT_008` | 401 | Invalid Mux webhook signature |
