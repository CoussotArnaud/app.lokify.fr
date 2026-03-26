CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  account_role TEXT NOT NULL DEFAULT 'provider',
  provider_status TEXT NOT NULL DEFAULT 'active',
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  country TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS account_role TEXT NOT NULL DEFAULT 'provider';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS postal_code TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS city TEXT;

UPDATE users
SET account_role = 'super_admin'
WHERE account_role = 'owner';

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 1 CHECK (stock >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'maintenance', 'unavailable')),
  price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  deposit NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'completed', 'cancelled')),
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservation_dates_valid CHECK (end_date > start_date)
);

CREATE TABLE IF NOT EXISTS lokify_billing_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lokify_plan_id TEXT,
  lokify_plan_name TEXT,
  lokify_plan_price NUMERIC(10, 2),
  lokify_plan_interval TEXT NOT NULL DEFAULT 'month',
  lokify_subscription_status TEXT NOT NULL DEFAULT 'inactive',
  lokify_subscription_start_at TIMESTAMPTZ,
  lokify_subscription_end_at TIMESTAMPTZ,
  lokify_stripe_customer_id TEXT,
  lokify_stripe_subscription_id TEXT,
  lokify_stripe_checkout_session_id TEXT,
  billing_environment TEXT NOT NULL DEFAULT 'test',
  subscription_locked BOOLEAN NOT NULL DEFAULT TRUE,
  access_restricted_by_subscription BOOLEAN NOT NULL DEFAULT TRUE,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  renewal_canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS renewal_canceled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS customer_payment_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  customer_stripe_mode TEXT NOT NULL DEFAULT 'test',
  customer_stripe_publishable_key TEXT,
  customer_stripe_secret_key_encrypted TEXT,
  customer_stripe_webhook_secret_encrypted TEXT,
  customer_stripe_account_id TEXT,
  customer_stripe_account_status TEXT NOT NULL DEFAULT 'not_configured',
  customer_stripe_configured_at TIMESTAMPTZ,
  customer_payment_status TEXT NOT NULL DEFAULT 'unknown',
  customer_last_payment_at TIMESTAMPTZ,
  customer_next_payment_due_at TIMESTAMPTZ,
  customer_payment_method_label TEXT,
  customer_payment_status_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_stripe_account_id TEXT;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_payment_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_last_payment_at TIMESTAMPTZ;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_next_payment_due_at TIMESTAMPTZ;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_payment_method_label TEXT;

ALTER TABLE customer_payment_settings
ADD COLUMN IF NOT EXISTS customer_payment_status_updated_at TIMESTAMPTZ;

ALTER TABLE customer_payment_settings
ALTER COLUMN customer_stripe_account_status SET DEFAULT 'not_configured';

UPDATE customer_payment_settings
SET customer_stripe_account_status = 'not_configured'
WHERE customer_stripe_account_status = 'coming_soon';

UPDATE customer_payment_settings AS cps
SET
  customer_payment_status = CASE
    WHEN LOWER(COALESCE(lbs.lokify_subscription_status, 'inactive')) = 'active' THEN 'paid'
    WHEN LOWER(COALESCE(lbs.lokify_subscription_status, 'inactive')) = 'trial' THEN 'trial'
    WHEN LOWER(COALESCE(lbs.lokify_subscription_status, 'inactive')) = 'past_due' THEN 'overdue'
    WHEN LOWER(COALESCE(lbs.lokify_subscription_status, 'inactive')) = 'canceled'
      AND lbs.lokify_subscription_end_at IS NOT NULL
      AND lbs.lokify_subscription_end_at < NOW() THEN 'expired'
    WHEN LOWER(COALESCE(lbs.lokify_subscription_status, 'inactive')) = 'canceled' THEN 'canceled'
    WHEN lbs.lokify_plan_id IS NOT NULL THEN 'pending'
    ELSE 'unknown'
  END,
  customer_payment_status_updated_at = COALESCE(customer_payment_status_updated_at, NOW()),
  customer_next_payment_due_at = COALESCE(customer_next_payment_due_at, lbs.lokify_subscription_end_at)
FROM lokify_billing_settings AS lbs
WHERE cps.user_id = lbs.user_id
  AND (cps.customer_payment_status IS NULL OR cps.customer_payment_status = 'unknown');

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  delivery_mode TEXT NOT NULL DEFAULT 'log',
  delivery_reference TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_created_at_idx
ON password_reset_tokens(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS super_admin_stripe_settings (
  settings_key TEXT PRIMARY KEY DEFAULT 'platform',
  stripe_publishable_key TEXT,
  stripe_secret_key_encrypted TEXT,
  stripe_webhook_secret_encrypted TEXT,
  subscription_price_ids_json TEXT NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lokify_checkout_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  lokify_plan_id TEXT NOT NULL,
  lokify_plan_name TEXT NOT NULL,
  lokify_plan_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (lokify_plan_price >= 0),
  lokify_plan_interval TEXT NOT NULL DEFAULT 'month',
  checkout_state TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lokify_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_lokify_checkout_sessions_user_id ON lokify_checkout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lokify_checkout_sessions_state ON lokify_checkout_sessions(checkout_state);
CREATE INDEX IF NOT EXISTS idx_users_account_role ON users(account_role);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS clients_set_updated_at ON clients;
CREATE TRIGGER clients_set_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS items_set_updated_at ON items;
CREATE TRIGGER items_set_updated_at
BEFORE UPDATE ON items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reservations_set_updated_at ON reservations;
CREATE TRIGGER reservations_set_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS lokify_billing_settings_set_updated_at ON lokify_billing_settings;
CREATE TRIGGER lokify_billing_settings_set_updated_at
BEFORE UPDATE ON lokify_billing_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS customer_payment_settings_set_updated_at ON customer_payment_settings;
CREATE TRIGGER customer_payment_settings_set_updated_at
BEFORE UPDATE ON customer_payment_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS lokify_checkout_sessions_set_updated_at ON lokify_checkout_sessions;
CREATE TRIGGER lokify_checkout_sessions_set_updated_at
BEFORE UPDATE ON lokify_checkout_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS super_admin_stripe_settings_set_updated_at ON super_admin_stripe_settings;
CREATE TRIGGER super_admin_stripe_settings_set_updated_at
BEFORE UPDATE ON super_admin_stripe_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
