-- T-85: вэбийн passkey (WebAuthn platform authenticator) — апп түгжээ тайлах (DD-AURA-033, AC-157).
-- credential_id нь base64url (гэрээний `/passkeys/{credentialId}`). attested_credential_data нь webauthn4j-ийн
-- AttestedCredentialDataConverter-ийн байт (AAGUID, credentialId, COSE нийтийн түлхүүр).
CREATE TABLE webauthn_credential (
    id                        uuid PRIMARY KEY,
    user_id                   uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    credential_id             varchar(1400)  NOT NULL,
    attested_credential_data  bytea          NOT NULL,
    sign_count                bigint         NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
    uv_initialized            boolean        NOT NULL DEFAULT false,
    backup_eligible           boolean        NOT NULL DEFAULT false,
    backup_state              boolean        NOT NULL DEFAULT false,
    transports                varchar(200),
    created_at                timestamptz    NOT NULL,
    last_used_at              timestamptz,
    CONSTRAINT webauthn_credential_id_uk UNIQUE (credential_id)
);
CREATE INDEX webauthn_credential_user_idx ON webauthn_credential (user_id);

-- Нэг удаагийн challenge: баталгаажуулахад DELETE … RETURNING-ээр устгагдана (давтан ашиглалт 400)
CREATE TABLE webauthn_challenge (
    id          uuid PRIMARY KEY,
    user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind        varchar(8)    NOT NULL CHECK (kind IN ('REGISTER', 'ASSERT')),
    challenge   varchar(64)   NOT NULL,
    expires_at  timestamptz   NOT NULL,
    CONSTRAINT webauthn_challenge_uk UNIQUE (challenge)
);
CREATE INDEX webauthn_challenge_user_idx ON webauthn_challenge (user_id, kind, expires_at);
