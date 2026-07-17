-- Per-user notification preferences within an organization
CREATE TABLE IF NOT EXISTS notification_preferences (
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  email_notifications INTEGER NOT NULL DEFAULT 1,
  mention_notifications INTEGER NOT NULL DEFAULT 1,
  digest_notifications INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (organization_id, user_id)
);

-- Notification history + unread state
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  data TEXT DEFAULT '{}',
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique
  ON notifications(organization_id, user_id, type, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notifications_org_user
  ON notifications(organization_id, user_id, read_at, created_at DESC);
