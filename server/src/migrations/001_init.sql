CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS guests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT UNIQUE NOT NULL,
  nickname   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saves (
  guest_id       UUID PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  coins          INT NOT NULL DEFAULT 0,
  inventory      JSONB NOT NULL DEFAULT '{}',
  tutorial_done  BOOLEAN NOT NULL DEFAULT false,
  owned_classes  JSONB NOT NULL DEFAULT '[]',
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code        TEXT NOT NULL,
  board_mode       TEXT NOT NULL,
  status           TEXT NOT NULL,
  blue_guest_id    UUID REFERENCES guests(id),
  red_guest_id     UUID REFERENCES guests(id),
  state            JSONB NOT NULL DEFAULT '{}',
  turn_started_at  TIMESTAMPTZ,
  match_started_at TIMESTAMPTZ,
  turn_deadline_at TIMESTAMPTZ,
  match_deadline_at TIMESTAMPTZ,
  turn_bonus_ms    INT NOT NULL DEFAULT 0,
  timers_paused    BOOLEAN NOT NULL DEFAULT false,
  winner           TEXT,
  end_reason       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_matches_guests ON matches (blue_guest_id, red_guest_id);
CREATE INDEX IF NOT EXISTS idx_matches_code ON matches (room_code);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
