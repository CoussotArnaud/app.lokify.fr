CREATE TABLE IF NOT EXISTS reservation_documents (
  id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservation_documents_unique_type UNIQUE (reservation_id, document_type)
);

CREATE INDEX IF NOT EXISTS reservation_documents_user_type_idx
  ON reservation_documents (user_id, document_type, issued_at DESC);
