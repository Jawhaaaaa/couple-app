-- T-59: хамтын зорилго (LLD §3 `goal`, FR-9.3, 9.4, AC-42, AC-108). Явц = Σ хандив / зорилт (мөнгөн),
-- эсвэл дууссан алхам / нийт алхам. `version` (DD-AURA-016).

CREATE TABLE goal (
    id                 uuid PRIMARY KEY,
    space_id           uuid          NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    title              varchar(120)  NOT NULL,
    target_date        date,
    target_amount_mnt  bigint        CHECK (target_amount_mnt > 0),
    created_by         uuid          NOT NULL REFERENCES users (id),
    updated_by         uuid          REFERENCES users (id),
    completed_at       timestamptz,
    version            bigint        NOT NULL DEFAULT 0,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX goal_space_idx ON goal (space_id, created_at);

CREATE TABLE goal_step (
    id          uuid PRIMARY KEY,
    goal_id     uuid          NOT NULL REFERENCES goal (id) ON DELETE CASCADE,
    title       varchar(120)  NOT NULL,
    position    integer       NOT NULL DEFAULT 0,
    done_by     uuid          REFERENCES users (id),
    done_at     timestamptz,
    created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX goal_step_goal_idx ON goal_step (goal_id, position);

CREATE TABLE goal_contribution (
    id          uuid PRIMARY KEY,
    goal_id     uuid          NOT NULL REFERENCES goal (id) ON DELETE CASCADE,
    user_id     uuid          NOT NULL REFERENCES users (id),
    amount_mnt  bigint        NOT NULL CHECK (amount_mnt > 0),
    created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX goal_contribution_goal_idx ON goal_contribution (goal_id, created_at);
