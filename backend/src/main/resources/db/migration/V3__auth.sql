-- Auth (T-17…T-20, LLD §3, DD-AURA-006/007/029/031/032). Нууц утга (код, токен) зөвхөн hash-аар.

-- Нэг хэрэглэгчид provider тутам нэг
CREATE TABLE oauth_identity (
    id          uuid PRIMARY KEY,
    user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider    varchar(8)   NOT NULL CHECK (provider IN ('GOOGLE', 'APPLE')),
    subject     varchar(255) NOT NULL,
    email       citext,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT oauth_identity_provider_subject_uk UNIQUE (provider, subject),
    CONSTRAINT oauth_identity_user_provider_uk UNIQUE (user_id, provider)
);

-- Имэйлийн код/холбоос. code_hash — HMAC-SHA256 (6 оронтой кодыг DB алдагдсан ч таахгүй),
-- link_token_hash — SHA-256 (256 бит санамсаргүй). VERIFY 15 мин, PASSWORD_RESET 30 мин, нэг удаагийн.
CREATE TABLE email_token (
    id               uuid PRIMARY KEY,
    user_id          uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose          varchar(16)  NOT NULL CHECK (purpose IN ('VERIFY', 'EMAIL_CHANGE', 'PASSWORD_RESET', 'NOT_ME', 'OAUTH_LINK')),
    code_hash        varchar(64),
    link_token_hash  varchar(64),
    new_email        citext,
    expires_at       timestamptz  NOT NULL,
    attempts         integer      NOT NULL DEFAULT 0,
    consumed_at      timestamptz,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT email_token_link_uk UNIQUE (link_token_hash)
);
CREATE INDEX email_token_user_purpose_idx ON email_token (user_id, purpose, created_at DESC);

-- Төхөөрөмжийн session (refresh-ийн гэр бүл). Revoke → бүх refresh хүчингүй.
CREATE TABLE device_session (
    id              uuid PRIMARY KEY,
    user_id         uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_name     varchar(100)  NOT NULL,
    platform        varchar(8)    NOT NULL CHECK (platform IN ('IOS', 'ANDROID', 'WEB')),
    created_at      timestamptz   NOT NULL DEFAULT now(),
    last_used_at    timestamptz   NOT NULL DEFAULT now(),
    revoked_at      timestamptz,
    revoked_reason  varchar(16)   CHECK (revoked_reason IN ('LOGOUT', 'REUSE', 'PASSWORD_RESET', 'PASSWORD_CHANGE',
                                                            'NOT_ME', 'REVOKED', 'REVOKE_ALL'))
);
CREATE INDEX device_session_user_idx ON device_session (user_id, created_at DESC);

-- Opaque refresh (256 бит), SHA-256 hash, 30 хоног, rotation (DD-AURA-007)
CREATE TABLE refresh_token (
    id           uuid PRIMARY KEY,
    session_id   uuid         NOT NULL REFERENCES device_session (id) ON DELETE CASCADE,
    token_hash   varchar(64)  NOT NULL,
    expires_at   timestamptz  NOT NULL,
    rotated_at   timestamptz,
    replaced_by  uuid         REFERENCES refresh_token (id) ON DELETE SET NULL,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT refresh_token_hash_uk UNIQUE (token_hash)
);
CREATE INDEX refresh_token_session_idx ON refresh_token (session_id);

-- OAuth callback-ийн үр дүн (DD-AURA-032): нэг удаагийн exchange код 60 с, холбох токен 10 мин.
-- IdP-ийн баталгаажуулсан identity-г client-ийн exchange/link хүртэл хадгална.
CREATE TABLE oauth_login (
    id                    uuid PRIMARY KEY,
    provider              varchar(8)    NOT NULL CHECK (provider IN ('GOOGLE', 'APPLE')),
    subject               varchar(255)  NOT NULL,
    email                 citext        NOT NULL,
    display_name          varchar(100),
    client                varchar(8)    NOT NULL CHECK (client IN ('web', 'native')),
    exchange_code_hash    varchar(64)   NOT NULL,
    exchange_expires_at   timestamptz   NOT NULL,
    exchanged_at          timestamptz,
    link_user_id          uuid          REFERENCES users (id) ON DELETE CASCADE,
    link_token_hash       varchar(64),
    link_expires_at       timestamptz,
    linked_at             timestamptz,
    device_name           varchar(100),
    device_platform       varchar(8)    CHECK (device_platform IN ('IOS', 'ANDROID', 'WEB')),
    created_at            timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT oauth_login_exchange_uk UNIQUE (exchange_code_hash),
    CONSTRAINT oauth_login_link_uk UNIQUE (link_token_hash)
);
