-- Дурсамж (T-35…T-37, LLD §3). Хайлт pg_trgm (DD-AURA-015), хогийн сав 30 хоног (AC-23),
-- зөвхөн зохиогч засна (INV-03), version (DD-AURA-016). date_plan_id-ийн FK төлөвлөгөөний
-- migration-д (T-51) нэмэгдэнэ.

CREATE TABLE memory (
    id               uuid PRIMARY KEY,
    space_id         uuid           NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    author_id        uuid           NOT NULL REFERENCES users (id),
    client_id        uuid           NOT NULL,
    title            varchar(120)   NOT NULL,
    description      varchar(5000),
    occurred_on      date           NOT NULL,
    date_source      varchar(8)     NOT NULL DEFAULT 'MANUAL' CHECK (date_source IN ('EXIF', 'MANUAL')),
    location_name    varchar(200),
    lat              double precision,
    lon              double precision,
    city             varchar(120),
    country_code     char(2),
    location_source  varchar(8)     NOT NULL DEFAULT 'NONE' CHECK (location_source IN ('EXIF', 'MANUAL', 'NONE')),
    date_plan_id     uuid,
    deleted_at       timestamptz,
    purge_after      timestamptz,
    search_text      text           NOT NULL DEFAULT '',
    version          bigint         NOT NULL DEFAULT 0,
    created_at       timestamptz    NOT NULL DEFAULT now(),
    updated_at       timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT memory_client_uk UNIQUE (author_id, client_id)
);
CREATE INDEX memory_space_occurred_idx ON memory (space_id, occurred_on DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX memory_search_trgm_idx ON memory USING gin (search_text gin_trgm_ops);
CREATE INDEX memory_purge_idx ON memory (purge_after) WHERE deleted_at IS NOT NULL;

CREATE TABLE memory_media (
    memory_id  uuid          NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
    media_id   uuid          NOT NULL REFERENCES media (id) ON DELETE CASCADE,
    position   integer       NOT NULL,
    alt_text   varchar(300),
    PRIMARY KEY (memory_id, media_id)
);
CREATE INDEX memory_media_media_idx ON memory_media (media_id);

CREATE TABLE memory_tag (
    memory_id  uuid         NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
    tag        varchar(40)  NOT NULL,
    PRIMARY KEY (memory_id, tag)
);
CREATE INDEX memory_tag_tag_idx ON memory_tag (tag);

-- AC-81: бүлэг устахад дурсамж хэвээр
CREATE TABLE memory_group (
    id              uuid PRIMARY KEY,
    space_id        uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    name            varchar(80)   NOT NULL,
    cover_media_id  uuid          REFERENCES media (id) ON DELETE SET NULL,
    version         bigint        NOT NULL DEFAULT 0,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX memory_group_space_idx ON memory_group (space_id);

CREATE TABLE memory_group_item (
    group_id   uuid NOT NULL REFERENCES memory_group (id) ON DELETE CASCADE,
    memory_id  uuid NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
    added_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, memory_id)
);
CREATE INDEX memory_group_item_memory_idx ON memory_group_item (memory_id);

-- AC-82: хүн тутам нэг өнцөг, өөрийнхийг л засна
CREATE TABLE memory_perspective (
    id              uuid PRIMARY KEY,
    memory_id       uuid           NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
    author_id       uuid           NOT NULL REFERENCES users (id),
    text            varchar(2000)  NOT NULL,
    audio_media_id  uuid           REFERENCES media (id) ON DELETE SET NULL,
    version         bigint         NOT NULL DEFAULT 0,
    created_at      timestamptz    NOT NULL DEFAULT now(),
    updated_at      timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT memory_perspective_uk UNIQUE (memory_id, author_id)
);

CREATE TABLE memory_comment (
    id          uuid PRIMARY KEY,
    space_id    uuid           NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    memory_id   uuid           NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
    author_id   uuid           NOT NULL REFERENCES users (id),
    client_id   uuid           NOT NULL,
    text        varchar(1000)  NOT NULL,
    edited_at   timestamptz,
    version     bigint         NOT NULL DEFAULT 0,
    created_at  timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT memory_comment_client_uk UNIQUE (author_id, client_id)
);
CREATE INDEX memory_comment_memory_idx ON memory_comment (memory_id, created_at, id);
CREATE INDEX memory_comment_text_trgm_idx ON memory_comment USING gin (lower(text) gin_trgm_ops);

-- Хүн тутам объект бүрд нэг реакц (дурсамж, мессеж, сэтгэгдэл)
CREATE TABLE reaction (
    id           uuid PRIMARY KEY,
    space_id     uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    target_type  varchar(8)    NOT NULL CHECK (target_type IN ('MEMORY', 'MESSAGE', 'COMMENT')),
    target_id    uuid          NOT NULL,
    user_id      uuid          NOT NULL REFERENCES users (id),
    emoji        varchar(12)   NOT NULL CHECK (emoji IN ('LOVE', 'ADORE', 'HEART_EYES', 'KISS', 'HUG', 'SPARKLE')),
    created_at   timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT reaction_one_uk UNIQUE (target_type, target_id, user_id)
);
CREATE INDEX reaction_target_idx ON reaction (target_type, target_id);

-- AC-83: хүн тутмын «Дуртай»
CREATE TABLE memory_favorite (
    memory_id   uuid NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (memory_id, user_id)
);
