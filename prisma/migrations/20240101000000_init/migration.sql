-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'UPLOADING', 'PROCESSING', 'READY', 'PUBLISHED', 'FAILED');
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'ASSET_CREATED', 'FAILED');
CREATE TYPE "ProcessingStatus" AS ENUM ('WAITING', 'PREPARING', 'READY', 'ERRORED');
CREATE TYPE "VisibilityType" AS ENUM ('PUBLIC', 'GROUP_ONLY', 'PRIVATE');

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE "videos" (
    "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
    "author_user_id" TEXT          NOT NULL,
    "title"         TEXT           NOT NULL,
    "description"   TEXT,
    "status"        "VideoStatus"  NOT NULL DEFAULT 'DRAFT',
    "duration_sec"  INTEGER,
    "thumbnail_url" TEXT,
    "created_at"    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "updated_at"    TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "videos_author_user_id_idx" ON "videos"("author_user_id");
CREATE INDEX "videos_status_idx"         ON "videos"("status");

CREATE TABLE "video_assets" (
    "id"               UUID               NOT NULL DEFAULT gen_random_uuid(),
    "video_id"         UUID               NOT NULL,
    "mux_asset_id"     TEXT,
    "mux_upload_id"    TEXT,
    "playback_id"      TEXT,
    "upload_status"    "UploadStatus"     NOT NULL DEFAULT 'PENDING',
    "processing_status" "ProcessingStatus" NOT NULL DEFAULT 'WAITING',
    "error_message"    TEXT,
    "created_at"       TIMESTAMPTZ        NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ        NOT NULL DEFAULT now(),

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_assets_video_id_key"      ON "video_assets"("video_id");
CREATE UNIQUE INDEX "video_assets_mux_asset_id_key"  ON "video_assets"("mux_asset_id") WHERE "mux_asset_id" IS NOT NULL;
CREATE UNIQUE INDEX "video_assets_mux_upload_id_key" ON "video_assets"("mux_upload_id") WHERE "mux_upload_id" IS NOT NULL;

CREATE TABLE "video_topics" (
    "id"       UUID NOT NULL DEFAULT gen_random_uuid(),
    "video_id" UUID NOT NULL,
    "topic_id" TEXT NOT NULL,

    CONSTRAINT "video_topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_topics_video_id_topic_id_key" ON "video_topics"("video_id", "topic_id");
CREATE INDEX "video_topics_video_id_idx"                 ON "video_topics"("video_id");
CREATE INDEX "video_topics_topic_id_idx"                 ON "video_topics"("topic_id");

CREATE TABLE "video_visibility_rules" (
    "id"              UUID             NOT NULL DEFAULT gen_random_uuid(),
    "video_id"        UUID             NOT NULL,
    "visibility_type" "VisibilityType" NOT NULL DEFAULT 'PUBLIC',
    "group_id"        TEXT,

    CONSTRAINT "video_visibility_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_visibility_rules_video_id_key" ON "video_visibility_rules"("video_id");

-- ─── Foreign Keys ─────────────────────────────────────────────────────────────

ALTER TABLE "video_assets"
    ADD CONSTRAINT "video_assets_video_id_fkey"
        FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;

ALTER TABLE "video_topics"
    ADD CONSTRAINT "video_topics_video_id_fkey"
        FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;

ALTER TABLE "video_visibility_rules"
    ADD CONSTRAINT "video_visibility_rules_video_id_fkey"
        FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER videos_set_updated_at
    BEFORE UPDATE ON "videos"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER video_assets_set_updated_at
    BEFORE UPDATE ON "video_assets"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
