ALTER TABLE saves ADD COLUMN IF NOT EXISTS daily_quests JSONB NOT NULL DEFAULT '{"dateKey":"","ready":[],"claimed":[]}';
