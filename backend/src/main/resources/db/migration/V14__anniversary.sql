-- Ой, автомат ой, нууц бэлэг, баярын тэмдэглэл (T-56, LLD §3, FR-8). Автомат ой (100 хоног, 1 жил…)
-- ба төрсөн өдөр хадгалагдахгүй — `AutoMilestoneCalculator` тооцоолно (AC-102); тэдгээрийн тэмдэглэл,
-- дурсамж, сануулга нь `milestone_note`-д түлхүүрээр (`days:1000`, `birthday:<userId>`).

CREATE TABLE anniversary (
    id             uuid PRIMARY KEY,
    space_id       uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    author_id      uuid          NOT NULL REFERENCES users (id),
    title          varchar(80)   NOT NULL,
    date           date          NOT NULL,
    kind           varchar(11)   NOT NULL CHECK (kind IN ('ANNIVERSARY', 'BIRTHDAY', 'FIRST_MET', 'OTHER')),
    recurring      boolean       NOT NULL,
    note           varchar(2000),
    reminder_days  integer[]     NOT NULL DEFAULT '{}',
    version        bigint        NOT NULL DEFAULT 0,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX anniversary_space_idx ON anniversary (space_id);

CREATE TABLE anniversary_memory (
    anniversary_id  uuid     NOT NULL REFERENCES anniversary (id) ON DELETE CASCADE,
    memory_id       uuid     NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
    position        integer  NOT NULL,
    PRIMARY KEY (anniversary_id, memory_id)
);

-- Автомат ой ба төрсөн өдрийн тэмдэглэл (AC-105), сануулга (AC-104). Мөргүй бол хоосон, version 0.
CREATE TABLE milestone_note (
    space_id       uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    occasion_key   varchar(60)   NOT NULL,
    note           varchar(2000),
    memory_ids     uuid[]        NOT NULL DEFAULT '{}',
    reminder_days  integer[]     NOT NULL DEFAULT '{}',
    version        bigint        NOT NULL DEFAULT 0,
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, occasion_key)
);

-- Нууц бэлгийн санаа (FR-8.7): зөвхөн `owner_id`-д харагдана — хамтрагчийн аль ч хариунд 0 (AC-40, INV-04).
CREATE TABLE gift_idea (
    id            uuid PRIMARY KEY,
    space_id      uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    owner_id      uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    occasion_key  varchar(60)   NOT NULL,
    text          varchar(300)  NOT NULL,
    done          boolean       NOT NULL DEFAULT false,
    created_at    timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX gift_idea_owner_idx ON gift_idea (owner_id, occasion_key);
CREATE INDEX gift_idea_space_idx ON gift_idea (space_id);

-- Баярын анимаци хэрэглэгч тутамд нэг удаа (GAP-23, AC-39, AC-MO-02) — сервер тэмдэглэнэ.
CREATE TABLE celebration_seen (
    user_id    uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_key  varchar(120)  NOT NULL,
    seen_at    timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_key)
);
