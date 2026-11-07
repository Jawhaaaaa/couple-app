-- Өдрийн асуулт (T-29, DD-AURA-021) ба зүрхний дохио (T-30). Хосын өдөр = хосын бүсийн огноо (SD-02).

-- Өдрийн эхний хүсэлтэд үүсч царцна — хоёр хүнд ижил асуулт (AC-75)
CREATE TABLE daily_question (
    space_id     uuid         NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    couple_day   date         NOT NULL,
    question_id  varchar(16)  NOT NULL,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, couple_day)
);

-- INV-04: хоёулаа хариулах хүртэл нөгөөгийнх API-д гарахгүй (AC-15)
CREATE TABLE question_answer (
    id          uuid PRIMARY KEY,
    space_id    uuid           NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    couple_day  date           NOT NULL,
    user_id     uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    text        varchar(1000)  NOT NULL,
    created_at  timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT question_answer_once_uk UNIQUE (space_id, couple_day, user_id),
    CONSTRAINT question_answer_day_fk FOREIGN KEY (space_id, couple_day) REFERENCES daily_question (space_id, couple_day) ON DELETE CASCADE
);

-- FR-4.1…4.5: HEART (товшилт), HUG (≥ 0.6 с), THINKING (≤ 80 тэмдэгт); idempotent client_id
CREATE TABLE heart_signal (
    id          uuid PRIMARY KEY,
    space_id    uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    sender_id   uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    client_id   uuid          NOT NULL,
    kind        varchar(8)    NOT NULL CHECK (kind IN ('HEART', 'HUG', 'THINKING')),
    text        varchar(80),
    couple_day  date          NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    seen_at     timestamptz,
    CONSTRAINT heart_signal_client_uk UNIQUE (sender_id, client_id)
);
CREATE INDEX heart_signal_space_day_idx ON heart_signal (space_id, couple_day);
CREATE INDEX heart_signal_unseen_idx ON heart_signal (space_id, sender_id) WHERE seen_at IS NULL;
