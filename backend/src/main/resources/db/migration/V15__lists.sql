-- Хамтын жагсаалт (T-58, LLD §3 `list_item`, FR-9.1, FR-9.2, FR-9.5, FR-9.6). Bucket, to-do,
-- худалдан авалт, wishlist нэг хүснэгтэд `list_kind`-аар. Зэрэг засварт `version` (DD-AURA-016,
-- AC-41); «Дууссаныг цэвэрлэх» нь мөрийг устгахгүй, `cleared_at` тавина (AC-107, INV-07).

CREATE TABLE list_item (
    id           uuid PRIMARY KEY,
    space_id     uuid           NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    list_kind    varchar(8)     NOT NULL CHECK (list_kind IN ('BUCKET', 'TODO', 'SHOPPING', 'WISHLIST')),
    client_id    uuid           NOT NULL,
    title        varchar(120)   NOT NULL,
    description  varchar(2000),
    category     varchar(40),
    wish_type    varchar(5)     CHECK (wish_type IN ('MOVIE', 'BOOK', 'PLACE', 'OTHER')),
    position     integer        NOT NULL DEFAULT 0,
    created_by   uuid           NOT NULL REFERENCES users (id),
    updated_by   uuid           REFERENCES users (id),
    done_by      uuid           REFERENCES users (id),
    done_at      timestamptz,
    cleared_at   timestamptz,
    version      bigint         NOT NULL DEFAULT 0,
    created_at   timestamptz    NOT NULL DEFAULT now(),
    updated_at   timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT list_item_client_uk UNIQUE (created_by, client_id)
);
CREATE INDEX list_item_space_kind_idx ON list_item (space_id, list_kind, position) WHERE cleared_at IS NULL;

-- «Хүсэж байна» санал — хүн тутам нэг (AC-109)
CREATE TABLE list_item_vote (
    item_id     uuid          NOT NULL REFERENCES list_item (id) ON DELETE CASCADE,
    user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, user_id)
);
