ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_requirements_due_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_disabled_reason TEXT;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_display_name TEXT;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_country TEXT;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_last_sync_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS storefront_checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storefront_slug TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  checkout_status TEXT NOT NULL DEFAULT 'pending',
  amount_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_total >= 0),
  deposit_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deposit_total >= 0),
  request_payload_json TEXT NOT NULL DEFAULT '{}',
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  checkout_url TEXT,
  checkout_completed_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storefront_checkout_sessions_user_created_at
ON storefront_checkout_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_storefront_checkout_sessions_slug_created_at
ON storefront_checkout_sessions(storefront_slug, created_at DESC);
