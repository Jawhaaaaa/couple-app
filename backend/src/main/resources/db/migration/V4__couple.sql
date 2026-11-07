-- Урилга ба хос холбох (T-22, LLD §3, DD-AURA-039). Код «AURA-XXXX», алфавит 0/O/1/I-гүй.
-- Хүчинтэй (ACTIVE) код давхцахгүй; ашиглагдсан/хугацаа дууссан кодыг дахин ашиглаж болно (32⁴ орон зай).

CREATE TABLE invite (
    id          uuid PRIMARY KEY,
    code        varchar(9)   NOT NULL CHECK (code ~ '^AURA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$'),
    inviter_id  uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at  timestamptz  NOT NULL,
    status      varchar(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'CANCELLED', 'EXPIRED')),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invite_active_code_uk ON invite (code) WHERE status = 'ACTIVE';
CREATE INDEX invite_code_idx ON invite (code, created_at DESC);
CREATE INDEX invite_inviter_idx ON invite (inviter_id, status);

-- AC-170: хоёр тал баталсны дараа л space үүснэ
CREATE TABLE pairing (
    id          uuid PRIMARY KEY,
    invite_id   uuid         NOT NULL REFERENCES invite (id) ON DELETE CASCADE,
    inviter_id  uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joiner_id   uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status      varchar(18)  NOT NULL DEFAULT 'AWAITING_INVITER' CHECK (status IN ('AWAITING_INVITER', 'LINKED', 'CANCELLED')),
    space_id    uuid         REFERENCES space (id) ON DELETE SET NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pairing_invite_uk UNIQUE (invite_id)
);
CREATE INDEX pairing_inviter_idx ON pairing (inviter_id, status);
CREATE INDEX pairing_joiner_idx ON pairing (joiner_id, status);

-- AC-138: нэг space-д нэг PENDING санал
CREATE TABLE theme_proposal (
    id           uuid PRIMARY KEY,
    space_id     uuid         NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    proposer_id  uuid         NOT NULL REFERENCES users (id),
    theme        varchar(10)  NOT NULL CHECK (theme IN ('CORAL', 'LAVENDER', 'FOREST', 'OCEAN')),
    status       varchar(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX theme_proposal_pending_uk ON theme_proposal (space_id) WHERE status = 'PENDING';
