-- Resumable/chunked upload (T-33, DD-AURA-012, TQ-04). S3 multipart дээгүүр, 5 MiB chunk, 24 цагийн дараа abort.

CREATE TABLE upload_session (
    id             uuid PRIMARY KEY,
    owner_id       uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    space_id       uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    media_id       uuid          NOT NULL,
    purpose        varchar(20)   NOT NULL CHECK (purpose IN ('MEMORY', 'CHAT', 'LETTER', 'AVATAR', 'PERSPECTIVE_AUDIO', 'VOICE', 'FILE')),
    file_name      varchar(255)  NOT NULL,
    declared_mime  varchar(127)  NOT NULL,
    detected_mime  varchar(127),
    kind           varchar(8),
    total_bytes    bigint        NOT NULL CHECK (total_bytes > 0),
    duration_ms    bigint,
    chunk_size     integer       NOT NULL,
    total_chunks   integer       NOT NULL,
    received       integer[]     NOT NULL DEFAULT '{}',
    etags          jsonb         NOT NULL DEFAULT '{}'::jsonb,
    s3_key         varchar(512)  NOT NULL,
    s3_upload_id   varchar(255)  NOT NULL,
    status         varchar(10)   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED', 'ABORTED')),
    expires_at     timestamptz   NOT NULL,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX upload_session_owner_idx ON upload_session (owner_id, status);
CREATE INDEX upload_session_expiry_idx ON upload_session (status, expires_at);
