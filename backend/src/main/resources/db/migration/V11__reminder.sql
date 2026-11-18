-- Хуваарьт сануулга (LLD §3 `scheduled_reminder`, FR-19.4). Болзоо (T-51), ой (T-56), захидал (T-61),
-- мэндчилгээ (T-68) нэг хүснэгт хуваалцана. Эх объект өөрчлөгдөхөд мөрүүдийг устгаж дахин үүсгэнэ
-- (AC-35). Илгээгч нь `ReminderScheduler` (T-68): PENDING ба fire_at ≤ одоо мөрийг Web Push-ээр.

CREATE TABLE scheduled_reminder (
    id           uuid PRIMARY KEY,
    user_id      uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    space_id     uuid          REFERENCES space (id) ON DELETE CASCADE,
    source_type  varchar(12)   NOT NULL CHECK (source_type IN ('DATE_PLAN', 'ANNIVERSARY', 'LETTER', 'GREETING', 'INACTIVITY')),
    source_id    varchar(80)   NOT NULL,
    kind         varchar(40)   NOT NULL,
    params       jsonb         NOT NULL DEFAULT '{}'::jsonb,
    deep_link    varchar(512)  NOT NULL,
    fire_at      timestamptz   NOT NULL,
    status       varchar(9)    NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'CANCELLED')),
    created_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_reminder_due_idx ON scheduled_reminder (status, fire_at);
CREATE INDEX scheduled_reminder_source_idx ON scheduled_reminder (source_type, source_id);
