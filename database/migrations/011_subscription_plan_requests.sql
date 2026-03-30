ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS requested_lokify_plan_id TEXT;

ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS requested_lokify_plan_name TEXT;

ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS requested_lokify_plan_price NUMERIC(10, 2);

ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS requested_lokify_plan_interval TEXT;

ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS requested_lokify_plan_note TEXT;

ALTER TABLE lokify_billing_settings
ADD COLUMN IF NOT EXISTS requested_lokify_plan_requested_at TIMESTAMPTZ;
