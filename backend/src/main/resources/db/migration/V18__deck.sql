-- T-53: нууц санал нэгдэл (FR-7.9, GAP-22, AC-36). Хүн тутмын swipe; нөгөөгийн мөр API-д хэзээ ч гарахгүй (INV-04).
-- `idea_ref` = `library:<id>` эсвэл `idea:<uuid>`. Тохирол = хоёр гишүүн хоёулаа `liked`.

CREATE TABLE deck_swipe (
    space_id    uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    idea_ref    varchar(80)   NOT NULL,
    liked       boolean       NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, user_id, idea_ref)
);

CREATE TABLE deck_match (
    space_id    uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    idea_ref    varchar(80)   NOT NULL,
    matched_at  timestamptz   NOT NULL,
    PRIMARY KEY (space_id, idea_ref)
);
