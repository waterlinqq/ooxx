CREATE TABLE IF NOT EXISTS mail_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id     UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  attachments  JSONB NOT NULL DEFAULT '[]',
  read_at      TIMESTAMPTZ,
  claimed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_guest_created ON mail_messages (guest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_guest_unread ON mail_messages (guest_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mail_guest_unclaimed ON mail_messages (guest_id)
  WHERE claimed_at IS NULL AND attachments != '[]'::jsonb;
