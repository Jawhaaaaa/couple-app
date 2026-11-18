-- T-51, T-52: болзоо (LLD §3 `date_plan`, FR-7.2…7.7, 7.10). Цаг UTC-ээр (`starts_at`), харагдах бүс `timezone`
-- (AC-34). Давталттай болзооны нэг удаагийн өөрчлөлт/цуцлалт нь `series_id` + `occurrence_on`-той тусдаа мөр (AC-37).
-- Засагддаг мөр бүр `version` (DD-AURA-016).

CREATE TABLE date_plan (
    id                  uuid PRIMARY KEY,
    space_id            uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    proposer_id         uuid          NOT NULL REFERENCES users (id),
    client_id           uuid,
    idea_id             uuid          REFERENCES date_idea (id) ON DELETE SET NULL,
    title               varchar(80)   NOT NULL,
    description         varchar(2000),
    category            varchar(8)    CHECK (category IN ('FOOD', 'TRAVEL', 'HOME', 'SPORT', 'CULTURE', 'OUTDOOR', 'OTHER')),
    starts_at           timestamptz   NOT NULL,
    timezone            varchar(64)   NOT NULL,
    place_name          varchar(200),
    lat                 numeric(9, 6),
    lon                 numeric(9, 6),
    status              varchar(16)   NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED')),
    recurrence          varchar(8)    NOT NULL DEFAULT 'NONE' CHECK (recurrence IN ('NONE', 'WEEKLY', 'MONTHLY')),
    recurrence_until    date,
    series_id           uuid          REFERENCES date_plan (id) ON DELETE CASCADE,
    occurrence_on       date,
    planned_budget_mnt  bigint        CHECK (planned_budget_mnt >= 0),
    reminder_offsets    integer[]     NOT NULL DEFAULT '{}',
    memory_id           uuid          REFERENCES memory (id) ON DELETE SET NULL,
    responder_id        uuid          REFERENCES users (id),
    updated_by          uuid          REFERENCES users (id),
    version             bigint        NOT NULL DEFAULT 0,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    CHECK ((series_id IS NULL) = (occurrence_on IS NULL))
);

CREATE INDEX date_plan_space_starts_idx ON date_plan (space_id, starts_at);
CREATE UNIQUE INDEX date_plan_client_idx ON date_plan (proposer_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX date_plan_occurrence_idx ON date_plan (series_id, occurrence_on) WHERE series_id IS NOT NULL;

-- «Өөр цаг» — хариулагчийн 1–3 хувилбар (AC-33)
CREATE TABLE plan_counter_option (
    id           uuid PRIMARY KEY,
    plan_id      uuid         NOT NULL REFERENCES date_plan (id) ON DELETE CASCADE,
    proposer_id  uuid         NOT NULL REFERENCES users (id),
    starts_at    timestamptz  NOT NULL,
    chosen       boolean      NOT NULL DEFAULT false,
    created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX plan_counter_option_plan_idx ON plan_counter_option (plan_id);

-- Бэлтгэлийн checklist — бодит цагаар хоёр талд (AC-96)
CREATE TABLE checklist_item (
    id          uuid PRIMARY KEY,
    plan_id     uuid          NOT NULL REFERENCES date_plan (id) ON DELETE CASCADE,
    text        varchar(200)  NOT NULL,
    position    integer       NOT NULL DEFAULT 0,
    done_by     uuid          REFERENCES users (id),
    done_at     timestamptz,
    created_by  uuid          NOT NULL REFERENCES users (id),
    updated_by  uuid          REFERENCES users (id),
    version     bigint        NOT NULL DEFAULT 0,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX checklist_item_plan_idx ON checklist_item (plan_id, position);

-- Бодит зардал — хэн төлсөн (AC-97)
CREATE TABLE expense (
    id          uuid PRIMARY KEY,
    plan_id     uuid          NOT NULL REFERENCES date_plan (id) ON DELETE CASCADE,
    space_id    uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    payer_id    uuid          NOT NULL REFERENCES users (id),
    created_by  uuid          NOT NULL REFERENCES users (id),
    amount_mnt  bigint        NOT NULL CHECK (amount_mnt > 0),
    note        varchar(200),
    spent_on    date          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX expense_plan_idx ON expense (plan_id);
CREATE INDEX expense_space_spent_idx ON expense (space_id, spent_on);

-- Дурсамж ↔ болзоо (V8-д хойшлуулсан FK, AC-95)
UPDATE memory SET date_plan_id = NULL WHERE date_plan_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM date_plan p WHERE p.id = memory.date_plan_id);
ALTER TABLE memory ADD CONSTRAINT memory_date_plan_fk FOREIGN KEY (date_plan_id) REFERENCES date_plan (id) ON DELETE SET NULL;
