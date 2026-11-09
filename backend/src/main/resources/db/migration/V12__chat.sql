-- Чат (T-43…T-45, LLD §3 `chat_message`). Хайлт pg_trgm (DD-AURA-015), idempotent `clientMessageId`
-- (DD-AURA-017), INV-05: устгах/дуусахад text, media_id, location NULL болж медиа устна.
-- `seq` — нэг миллисекундэд илгээсэн мессежүүдийг ч илгээсэн дарааллаар нь хуудаслах дотоод дугаар (AC-28).

CREATE TABLE chat_message (
    id                 uuid PRIMARY KEY,
    seq                bigint         GENERATED ALWAYS AS IDENTITY,
    space_id           uuid           NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    sender_id          uuid           NOT NULL REFERENCES users (id),
    client_message_id  uuid           NOT NULL,
    kind               varchar(8)     NOT NULL CHECK (kind IN ('TEXT', 'IMAGE', 'VOICE', 'FILE', 'LOCATION', 'HEART')),
    text               varchar(4000),
    media_id           uuid           REFERENCES media (id) ON DELETE SET NULL,
    location           jsonb,
    reply_to_id        uuid           REFERENCES chat_message (id) ON DELETE SET NULL,
    edited_at          timestamptz,
    deleted_at         timestamptz,
    disappear_seconds  integer        CHECK (disappear_seconds IN (60, 3600, 86400)),
    expires_at         timestamptz,
    delivered_at       timestamptz,
    read_at            timestamptz,
    pinned_at          timestamptz,
    pinned_by          uuid           REFERENCES users (id),
    screenshot_at      timestamptz,
    created_at         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chat_message_client_uk UNIQUE (sender_id, client_message_id),
    CONSTRAINT chat_message_seq_uk UNIQUE (seq)
);
CREATE INDEX chat_message_space_seq_idx ON chat_message (space_id, seq);
CREATE INDEX chat_message_space_created_idx ON chat_message (space_id, created_at);
CREATE INDEX chat_message_text_trgm_idx ON chat_message USING gin (lower(text) gin_trgm_ops);
CREATE INDEX chat_message_expires_idx ON chat_message (expires_at) WHERE expires_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX chat_message_pinned_idx ON chat_message (space_id, pinned_at) WHERE pinned_at IS NOT NULL;
CREATE INDEX chat_message_unread_idx ON chat_message (space_id, sender_id) WHERE read_at IS NULL AND deleted_at IS NULL;
CREATE INDEX chat_message_media_idx ON chat_message (media_id) WHERE media_id IS NOT NULL;
