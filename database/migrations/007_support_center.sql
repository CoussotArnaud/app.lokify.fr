CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  provider_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_provider_status_idx
  ON support_tickets (provider_user_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON support_ticket_messages (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS support_notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_notifications_user_read_idx
  ON support_notifications (user_id, read_at, created_at DESC);
