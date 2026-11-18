-- Болзооны санаа (T-50, LLD §3 `date_idea`, FR-7.1/7.11). Сангаас хуулсан бол `library_id` — хуулбар
-- нь эхийг өөрчлөхгүй (AC-99). Зөвхөн зохиогч засна (NOT_OWNER), version (DD-AURA-016).

CREATE TABLE date_idea (
    id           uuid PRIMARY KEY,
    space_id     uuid           NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    author_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    client_id    uuid           NOT NULL,
    title        varchar(80)    NOT NULL,
    description  varchar(2000),
    category     varchar(8)     NOT NULL CHECK (category IN ('FOOD', 'TRAVEL', 'HOME', 'SPORT', 'CULTURE', 'OUTDOOR', 'OTHER')),
    budget_mnt   bigint         CHECK (budget_mnt >= 0),
    place_name   varchar(200),
    lat          double precision,
    lon          double precision,
    city         varchar(120),
    country_code char(2),
    url          varchar(2048),
    setting      varchar(8)     CHECK (setting IN ('HOME', 'OUTDOOR')),
    library_id   varchar(40),
    version      bigint         NOT NULL DEFAULT 0,
    created_at   timestamptz    NOT NULL DEFAULT now(),
    updated_at   timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT date_idea_client_uk UNIQUE (author_id, client_id)
);
CREATE INDEX date_idea_space_idx ON date_idea (space_id, created_at DESC);
