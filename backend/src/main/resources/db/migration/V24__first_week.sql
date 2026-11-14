-- T-78: эхний 7 хоногийн даалгавар (FR-16.4, AC-134). Хэрэглэгч тутамд — хамтрагч тус тусдаа тэмдэглэнэ.
-- «Нуух» нь user_preference.first_week_hidden (V1). task_key = mobile/src/content/first-week.json-ийн id.
CREATE TABLE first_week_task (
    user_id   uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    task_key  varchar(32)  NOT NULL,
    status    varchar(8)   NOT NULL CHECK (status IN ('DONE', 'SKIPPED')),
    at        timestamptz  NOT NULL,
    PRIMARY KEY (user_id, task_key)
);
