-- Суурь схем (T-02, LLD §3). PK uuid (апп UUIDv7), цаг timestamptz (UTC, INV-08).
-- Space-д хамаарах хүснэгт бүр space_id … ON DELETE CASCADE (INV-16).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id                  uuid PRIMARY KEY,
    email               citext       NOT NULL,
    password_hash       varchar(255),
    display_name        varchar(100),
    call_name           varchar(50),
    birth_date          date,
    timezone            varchar(64)  NOT NULL DEFAULT 'Asia/Ulaanbaatar',
    locale              varchar(5)   NOT NULL DEFAULT 'mn' CHECK (locale IN ('mn', 'en')),
    city_name           varchar(120),
    city_lat            double precision,
    city_lon            double precision,
    country_code        char(2),
    avatar_media_id     uuid,
    email_verified_at   timestamptz,
    status              varchar(16)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
    require_password    boolean      NOT NULL DEFAULT false,
    session_version     integer      NOT NULL DEFAULT 0,
    policy_version      varchar(20),
    policy_accepted_at  timestamptz,
    online_visible      boolean      NOT NULL DEFAULT true,
    typing_visible      boolean      NOT NULL DEFAULT true,
    last_active_at      timestamptz,
    version             bigint       NOT NULL DEFAULT 0,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT users_email_uk UNIQUE (email)
);

-- Анхдагч: DARK, YMD_DOT, ALL, haptics=true, sound=false, auto_share=false (AC-183, AC-217)
CREATE TABLE user_preference (
    user_id             uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    theme               varchar(8)   NOT NULL DEFAULT 'DARK' CHECK (theme IN ('DARK', 'LIGHT', 'SYSTEM')),
    date_format         varchar(10)  NOT NULL DEFAULT 'YMD_DOT' CHECK (date_format IN ('YMD_DOT', 'DMY_SLASH', 'MDY_SLASH')),
    animation           varchar(8)   NOT NULL DEFAULT 'ALL' CHECK (animation IN ('ALL', 'REDUCED', 'OFF')),
    haptics             boolean      NOT NULL DEFAULT true,
    sound               boolean      NOT NULL DEFAULT false,
    checkin_auto_share  boolean      NOT NULL DEFAULT false,
    mascot_color        varchar(32),
    intro_seen          boolean      NOT NULL DEFAULT false,
    first_week_hidden   boolean      NOT NULL DEFAULT false,
    version             bigint       NOT NULL DEFAULT 0,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now()
);

-- DD-AURA-003: хэрэглэгч бүрд SOLO, хос холбогдоход COUPLE
CREATE TABLE space (
    id                      uuid PRIMARY KEY,
    kind                    varchar(8)   NOT NULL CHECK (kind IN ('SOLO', 'COUPLE')),
    status                  varchar(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BREAKING', 'ORPHANED', 'PURGING')),
    timezone                varchar(64)  NOT NULL DEFAULT 'Asia/Ulaanbaatar',
    start_date              date,
    start_date_confirmed    boolean      NOT NULL DEFAULT false,
    theme                   varchar(10)  NOT NULL DEFAULT 'CORAL' CHECK (theme IN ('CORAL', 'LAVENDER', 'FOREST', 'OCEAN')),
    next_meetup_at          timestamptz,
    chat_disappear_seconds  integer,
    linked_at               timestamptz,
    read_only_until         timestamptz,
    storage_bytes           bigint       NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
    version                 bigint       NOT NULL DEFAULT 0,
    created_at              timestamptz  NOT NULL DEFAULT now(),
    updated_at              timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE space_member (
    space_id                 uuid         NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    user_id                  uuid         NOT NULL REFERENCES users (id),
    space_kind               varchar(8)   NOT NULL CHECK (space_kind IN ('SOLO', 'COUPLE')),
    joined_at                timestamptz  NOT NULL DEFAULT now(),
    left_at                  timestamptz,
    proposed_start_date      date,
    partner_nickname         varchar(50),
    partner_avatar_media_id  uuid,
    solo_share_decision      varchar(8)   CHECK (solo_share_decision IN ('PENDING', 'SHARED', 'KEPT')),
    breakup_confirmed_at     timestamptz,
    restore_confirmed_at     timestamptz,
    PRIMARY KEY (space_id, user_id)
);

-- INV-02 (AC-66): нэг хэрэглэгч нэг л идэвхтэй хостой
CREATE UNIQUE INDEX space_member_one_active_couple_uk
    ON space_member (user_id)
    WHERE space_kind = 'COUPLE' AND left_at IS NULL;
CREATE INDEX space_member_user_idx ON space_member (user_id);

-- AC-63; одоогийн хувилбар aura.policy.version
CREATE TABLE policy_acceptance (
    user_id      uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    version      varchar(20)  NOT NULL,
    accepted_at  timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, version)
);

-- DD-AURA-029: login:{ip}:{email}, verify:{userId}, invite:{userId}
CREATE TABLE attempt_counter (
    key           varchar(255) PRIMARY KEY,
    window_start  timestamptz  NOT NULL,
    count         integer      NOT NULL DEFAULT 0,
    locked_until  timestamptz
);

-- DD-AURA-010: SELECT … FOR UPDATE SKIP LOCKED
CREATE TABLE job (
    id            uuid PRIMARY KEY,
    type          varchar(64)  NOT NULL,
    payload       jsonb        NOT NULL DEFAULT '{}'::jsonb,
    run_at        timestamptz  NOT NULL DEFAULT now(),
    status        varchar(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
    attempts      integer      NOT NULL DEFAULT 0,
    locked_until  timestamptz,
    last_error    text,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX job_status_run_at_idx ON job (status, run_at);

-- ShedLock-ийн стандарт хүснэгт (JdbcTemplateLockProvider, usingDbTime)
CREATE TABLE shedlock (
    name        varchar(64)  PRIMARY KEY,
    lock_until  timestamp    NOT NULL,
    locked_at   timestamp    NOT NULL,
    locked_by   varchar(255) NOT NULL
);
