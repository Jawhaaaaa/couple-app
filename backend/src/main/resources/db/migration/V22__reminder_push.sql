-- T-68: хуваарьт сануулгын push (DD-AURA-023, AC-155, AC-180). Native төхөөрөмж (`local_reminders`) сануулгыг
-- `GET /reminders`-оор өөрөө локал товлодог тул серверийн сануулгын push-ийг тэр subscription-д илгээхгүй.

ALTER TABLE push_outbox ADD COLUMN skip_local boolean NOT NULL DEFAULT false;

CREATE INDEX scheduled_reminder_user_idx ON scheduled_reminder (user_id, status, fire_at);
