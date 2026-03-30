ALTER TABLE reservation_documents
  ADD COLUMN IF NOT EXISTS content_text TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  capture_source TEXT NOT NULL DEFAULT 'upload',
  notes TEXT,
  content_base64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_documents_client_idx
  ON client_documents (client_id, created_at DESC);
