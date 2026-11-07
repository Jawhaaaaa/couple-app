-- Медиа (T-04, LLD §3, DD-AURA-013/014). S3 key: spaces/{spaceId}/{mediaId}/{variant}.
-- Space устахад CASCADE; S3 объектыг CouplePurgeJob prefix-ээр устгана (INV-16).

CREATE TABLE media (
    id           uuid PRIMARY KEY,
    space_id     uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    owner_id     uuid          NOT NULL REFERENCES users (id),
    kind         varchar(8)    NOT NULL CHECK (kind IN ('IMAGE', 'VIDEO', 'AUDIO', 'FILE')),
    mime         varchar(127)  NOT NULL,
    size_bytes   bigint        NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
    file_name    varchar(255),
    s3_key       varchar(512)  NOT NULL,
    variants     jsonb         NOT NULL DEFAULT '{}'::jsonb,
    blurhash     varchar(64),
    width        integer,
    height       integer,
    duration_ms  bigint,
    waveform     jsonb,
    status       varchar(10)   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
    version      bigint        NOT NULL DEFAULT 0,
    created_at   timestamptz   NOT NULL DEFAULT now(),
    updated_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX media_space_created_idx ON media (space_id, created_at DESC);

ALTER TABLE users
    ADD CONSTRAINT users_avatar_media_fk FOREIGN KEY (avatar_media_id) REFERENCES media (id) ON DELETE SET NULL;
ALTER TABLE space_member
    ADD CONSTRAINT space_member_partner_avatar_fk FOREIGN KEY (partner_avatar_media_id) REFERENCES media (id) ON DELETE SET NULL;
