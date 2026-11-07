-- Мэдэгдэл (T-25, LLD §3, DD-AURA-022). Апп доторх мэдэгдэл үргэлж бичигдэнэ (AC-119);
-- push нь тохиргоо, «Бүү саад бол», тайван горимоор шүүгдэж push_outbox-оор явна (AC-48).

CREATE TABLE notification (
    id          uuid PRIMARY KEY,
    user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    space_id    uuid          REFERENCES space (id) ON DELETE CASCADE,
    actor_id    uuid          REFERENCES users (id) ON DELETE SET NULL,
    type        varchar(40)   NOT NULL,
    variant_id  varchar(64)   NOT NULL,
    params      jsonb         NOT NULL DEFAULT '{}'::jsonb,
    deep_link   varchar(512)  NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    read_at     timestamptz
);
CREATE INDEX notification_user_created_idx ON notification (user_id, created_at DESC, id DESC);
CREATE INDEX notification_user_unread_idx ON notification (user_id) WHERE read_at IS NULL;

-- DND анхдагч 23:00–07:00 (AC-184); мэндчилгээ анхдагч = алс зайн (GAP-26) — мөр үүсэх үед тооцно
CREATE TABLE notification_setting (
    user_id              uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    dnd_start            time          NOT NULL DEFAULT '23:00',
    dnd_end              time          NOT NULL DEFAULT '07:00',
    hide_content         boolean       NOT NULL DEFAULT false,
    greeting_morning     boolean       NOT NULL DEFAULT false,
    greeting_evening     boolean       NOT NULL DEFAULT false,
    greeting_morning_at  time          NOT NULL DEFAULT '08:00',
    greeting_evening_at  time          NOT NULL DEFAULT '22:00',
    quiet_until          timestamptz,
    disabled_types       text[]        NOT NULL DEFAULT '{}',
    updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE push_subscription (
    id               uuid PRIMARY KEY,
    user_id          uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id       uuid          REFERENCES device_session (id) ON DELETE CASCADE,
    kind             varchar(4)    NOT NULL CHECK (kind IN ('WEB', 'EXPO')),
    endpoint         varchar(1024),
    p256dh           varchar(255),
    auth             varchar(255),
    expo_token       varchar(255),
    local_reminders  boolean       NOT NULL DEFAULT false,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT push_subscription_endpoint_uk UNIQUE (endpoint),
    CONSTRAINT push_subscription_expo_uk UNIQUE (expo_token),
    CONSTRAINT push_subscription_web_chk CHECK (kind <> 'WEB' OR (endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL)),
    CONSTRAINT push_subscription_expo_chk CHECK (kind <> 'EXPO' OR expo_token IS NOT NULL)
);
CREATE INDEX push_subscription_user_idx ON push_subscription (user_id);

CREATE TABLE push_outbox (
    id               uuid PRIMARY KEY,
    user_id          uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    notification_id  uuid          NOT NULL REFERENCES notification (id) ON DELETE CASCADE,
    deliver_after    timestamptz   NOT NULL,
    deferred         boolean       NOT NULL DEFAULT false,
    status           varchar(8)    NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'MERGED', 'DROPPED')),
    created_at       timestamptz   NOT NULL DEFAULT now(),
    sent_at          timestamptz
);
CREATE INDEX push_outbox_due_idx ON push_outbox (status, deliver_after);
CREATE INDEX push_outbox_user_idx ON push_outbox (user_id, status);
