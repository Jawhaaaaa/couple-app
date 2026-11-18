-- T-49: хамтын амлалт (FR-6.11, AC-93). Space-д нэг л PROPOSED эсвэл ACTIVE амлалт.
-- ACTIVE нь зөвшөөрсөн өдрөөс 7 хоног (starts_on … ends_on); дуусахад ENDED, хүн бүр үр дүнгээ тэмдэглэнэ.

CREATE TABLE shared_promise (
    id            uuid PRIMARY KEY,
    space_id      uuid         NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    proposer_id   uuid         NOT NULL REFERENCES users (id),
    text          varchar(140) NOT NULL,
    status        varchar(10)  NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACTIVE', 'DECLINED', 'ENDED')),
    starts_on     date,
    ends_on       date,
    outcome_a     boolean,
    outcome_b     boolean,
    responder_id  uuid         REFERENCES users (id),
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX shared_promise_space_status_idx ON shared_promise (space_id, status);
CREATE UNIQUE INDEX shared_promise_one_open_idx ON shared_promise (space_id) WHERE status IN ('PROPOSED', 'ACTIVE');
