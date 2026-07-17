-- App: per-user read state for conversations
CREATE TABLE IF NOT EXISTS conversation_reads (
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  last_read_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (organization_id, conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_reads_org_user
  ON conversation_reads(organization_id, user_id, conversation_id);
