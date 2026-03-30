ALTER TABLE users
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS scheduled_purge_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS restored_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS restore_reason TEXT;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS scheduled_purge_at TIMESTAMPTZ;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS restored_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS restore_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_archive_scope
  ON users (account_role, archived_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_scheduled_purge_at
  ON users (scheduled_purge_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_archive_scope
  ON clients (user_id, archived_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_scheduled_purge_at
  ON clients (scheduled_purge_at)
  WHERE archived_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS archive_purge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  owner_user_id UUID,
  archived_at TIMESTAMPTZ,
  archived_by UUID,
  archive_reason TEXT,
  scheduled_purge_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_trigger TEXT NOT NULL DEFAULT 'cron',
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS archive_purge_logs_entity_idx
  ON archive_purge_logs (entity_type, entity_id, purged_at DESC);

CREATE INDEX IF NOT EXISTS archive_purge_logs_owner_idx
  ON archive_purge_logs (owner_user_id, purged_at DESC);
