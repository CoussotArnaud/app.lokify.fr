CREATE TABLE IF NOT EXISTS domain_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_status TEXT NOT NULL DEFAULT 'pending',
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS domain_events_user_idx
  ON domain_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS domain_events_status_idx
  ON domain_events (event_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS domain_events_aggregate_idx
  ON domain_events (aggregate_type, aggregate_id, occurred_at DESC);
