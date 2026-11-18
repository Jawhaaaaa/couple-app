-- T-75: санал асуулга (AC-207, GAP-17), админы түдгэлзүүлэлтийн бүртгэл (AC-186, GAP-16),
-- апп нээлтийн өдрийн нэгтгэл (AC-206 — хэрэглэгчийн ID-гүй, зөвхөн тоо).

-- score NULL = алгассан. 30 хоногт ≤ 1 мөр (SurveyService)
CREATE TABLE survey_response (
    id          uuid PRIMARY KEY,
    user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    score       smallint     CHECK (score BETWEEN 1 AND 5),
    created_at  timestamptz  NOT NULL
);
CREATE INDEX survey_response_user_idx ON survey_response (user_id, created_at DESC);
CREATE INDEX survey_response_created_idx ON survey_response (created_at);

-- Админы үйлдлийн аудит: хэн, хэзээ, ямар шалтгаанаар
CREATE TABLE user_suspension (
    id          uuid PRIMARY KEY,
    user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    action      varchar(10)   NOT NULL CHECK (action IN ('SUSPEND', 'UNSUSPEND')),
    reason      varchar(500),
    actor_id    uuid          REFERENCES users (id) ON DELETE SET NULL,
    created_at  timestamptz   NOT NULL
);
CREATE INDEX user_suspension_user_idx ON user_suspension (user_id, created_at DESC);

-- Өдөр тутмын нээлтийн тоо (session × өдөр давхардалгүй). Хэрэглэгчийн ID хадгалахгүй
CREATE TABLE app_open_daily (
    day    date     PRIMARY KEY,
    opens  integer  NOT NULL DEFAULT 0 CHECK (opens >= 0)
);
