-- T-63: сэтгэл санааны check-in (LLD §3 `check_in`, FR-11.1…11.3, AC-46, AC-114, AC-115, AC-183).
-- Хүн тутам өдөрт нэг (өөрийн бүсийн огноо), өнгөрсөн өдөр засахгүй. Хамтрагчид зөвхөн `shared` (INV-04).

CREATE TABLE check_in (
    id          uuid PRIMARY KEY,
    user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    space_id    uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    local_date  date          NOT NULL,
    level       smallint      NOT NULL CHECK (level BETWEEN 1 AND 5),
    note        varchar(280),
    shared      boolean       NOT NULL DEFAULT false,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (user_id, local_date)
);

CREATE INDEX check_in_space_date_idx ON check_in (space_id, local_date);
