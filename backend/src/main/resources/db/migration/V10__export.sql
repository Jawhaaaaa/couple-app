-- Экспорт (T-42 PDF ном, ZIP цомог; T-72 бүтэн экспорт — LLD §3, AC-126). Файл S3-ийн `exports/` prefix-д —
-- хос устсаны дараа ч хамтрагчийн 30 хоногийн экспортын цонхонд хүрэлцэнэ (AC-128).
CREATE TABLE data_export (
    id          uuid PRIMARY KEY,
    user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    space_id    uuid          REFERENCES space (id) ON DELETE SET NULL,
    kind        varchar(10)   NOT NULL CHECK (kind IN ('FULL', 'BOOK_PDF', 'ALBUM_ZIP')),
    params      jsonb         NOT NULL DEFAULT '{}'::jsonb,
    status      varchar(8)    NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED')),
    s3_key      varchar(512),
    file_name   varchar(255),
    size_bytes  bigint,
    ready_at    timestamptz,
    expires_at  timestamptz,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX data_export_user_idx ON data_export (user_id, created_at DESC);
