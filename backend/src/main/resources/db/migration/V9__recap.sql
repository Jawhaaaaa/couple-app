-- Жилийн ойн хураангуй (T-41, FR-5.11, AC-84): ойн өдөр ≥ 5 дурсамжтай жилд л.
CREATE TABLE memory_recap (
    id              uuid PRIMARY KEY,
    space_id        uuid         NOT NULL REFERENCES space (id) ON DELETE CASCADE,
    anniversary_on  date         NOT NULL,
    year_number     integer      NOT NULL CHECK (year_number >= 1),
    memory_ids      uuid[]       NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT memory_recap_uk UNIQUE (space_id, anniversary_on)
);
