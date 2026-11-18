-- T-61: захидал ба цагийн капсул (LLD §3 `letter`, `capsule`; FR-10.1…10.5; AC-43…45, AC-111, AC-112, AC-182).
-- Хүргэхээс өмнө хүлээн авагчид агуулга 0 (INV-04). Капсул: хоёулаа битүүмжилсний дараа түгжинэ, нээх огноо
-- хүртэл хэнд ч агуулга 0 (GAP-15).

CREATE TABLE letter (
    id              uuid PRIMARY KEY,
    space_id        uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    author_id       uuid          NOT NULL REFERENCES users (id),
    recipient_id    uuid          NOT NULL REFERENCES users (id),
    template        varchar(8)    NOT NULL CHECK (template IN ('PAPER_1', 'PAPER_2', 'PAPER_3')),
    body            text          NOT NULL CHECK (char_length(body) <= 20000),
    deliver_at      timestamptz,
    occasion_label  varchar(80),
    status          varchar(10)   NOT NULL CHECK (status IN ('DRAFT', 'SCHEDULED', 'DELIVERED', 'READ', 'CANCELLED')),
    delivered_at    timestamptz,
    read_at         timestamptz,
    version         bigint        NOT NULL DEFAULT 0,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX letter_due_idx ON letter (status, deliver_at) WHERE status = 'SCHEDULED';
CREATE INDEX letter_space_idx ON letter (space_id, created_at);

CREATE TABLE letter_media (
    letter_id  uuid     NOT NULL REFERENCES letter (id) ON DELETE CASCADE,
    media_id   uuid     NOT NULL REFERENCES media (id) ON DELETE CASCADE,
    position   integer  NOT NULL,
    PRIMARY KEY (letter_id, media_id)
);

CREATE TABLE capsule (
    id          uuid PRIMARY KEY,
    space_id    uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    creator_id  uuid          NOT NULL REFERENCES users (id),
    title       varchar(80)   NOT NULL,
    open_on     date          NOT NULL,
    status      varchar(8)    NOT NULL DEFAULT 'WRITING' CHECK (status IN ('WRITING', 'SEALED', 'OPENED')),
    sealed_at   timestamptz,
    opened_at   timestamptz,
    created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX capsule_space_idx ON capsule (space_id, open_on);
CREATE INDEX capsule_due_idx ON capsule (open_on) WHERE status = 'SEALED';

CREATE TABLE capsule_part (
    capsule_id  uuid          NOT NULL REFERENCES capsule (id) ON DELETE CASCADE,
    author_id   uuid          NOT NULL REFERENCES users (id),
    body        text          NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
    sealed_at   timestamptz,
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (capsule_id, author_id)
);

CREATE TABLE capsule_part_media (
    capsule_id  uuid     NOT NULL,
    author_id   uuid     NOT NULL,
    media_id    uuid     NOT NULL REFERENCES media (id) ON DELETE CASCADE,
    position    integer  NOT NULL,
    PRIMARY KEY (capsule_id, author_id, media_id),
    FOREIGN KEY (capsule_id, author_id) REFERENCES capsule_part (capsule_id, author_id) ON DELETE CASCADE
);
