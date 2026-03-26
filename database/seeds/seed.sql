WITH super_admin AS (
  INSERT INTO users (full_name, email, password_hash, account_role)
  VALUES (
    'Admin Lokify',
    'team@lokify.fr',
    crypt('admin', gen_salt('bf')),
    'super_admin'
  )
  ON CONFLICT (email) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    account_role = EXCLUDED.account_role
  RETURNING id
),
provider AS (
  INSERT INTO users (
    full_name,
    email,
    password_hash,
    account_role,
    provider_status,
    first_name,
    last_name,
    phone,
    country,
    address,
    postal_code,
    city
  )
  VALUES (
    'Prestataire Demo',
    'presta@lokify.fr',
    crypt('presta', gen_salt('bf')),
    'provider',
    'active',
    'Marie',
    'Lefevre',
    '06 48 32 19 84',
    'France',
    '18 avenue des Arts',
    '69006',
    'Lyon'
  )
  ON CONFLICT (email) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    account_role = EXCLUDED.account_role,
    provider_status = EXCLUDED.provider_status,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    country = EXCLUDED.country,
    address = EXCLUDED.address,
    postal_code = EXCLUDED.postal_code,
    city = EXCLUDED.city
  RETURNING id
),
reassign_clients AS (
  UPDATE clients
  SET user_id = (SELECT id FROM provider)
  WHERE user_id IN (
    SELECT id
    FROM users
    WHERE email IN ('admin@lokify.app', 'team@lokify.fr')
      AND account_role <> 'provider'
  )
  RETURNING id
),
reassign_items AS (
  UPDATE items
  SET user_id = (SELECT id FROM provider)
  WHERE user_id IN (
    SELECT id
    FROM users
    WHERE email IN ('admin@lokify.app', 'team@lokify.fr')
      AND account_role <> 'provider'
  )
  RETURNING id
),
reassign_reservations AS (
  UPDATE reservations
  SET user_id = (SELECT id FROM provider)
  WHERE user_id IN (
    SELECT id
    FROM users
    WHERE email IN ('admin@lokify.app', 'team@lokify.fr')
      AND account_role <> 'provider'
  )
  RETURNING id
),
cleanup_legacy_user AS (
  DELETE FROM users
  WHERE email = 'admin@lokify.app'
    AND id <> (SELECT id FROM super_admin)
  RETURNING id
),
provider_ref AS (
  SELECT id FROM provider
  UNION
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO clients (user_id, first_name, last_name, email, phone, address, notes)
SELECT provider_ref.id, 'Camille', 'Martin', 'camille@example.com', '0612345678', '12 rue des Fleurs, Paris', 'Cliente evenementiel'
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM clients WHERE email = 'camille@example.com'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO clients (user_id, first_name, last_name, email, phone, address, notes)
SELECT provider_ref.id, 'Julien', 'Robert', 'julien@example.com', '0687654321', '4 avenue Victor Hugo, Lyon', 'Location trottinettes week-end'
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM clients WHERE email = 'julien@example.com'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO items (user_id, name, category, stock, status, price, deposit)
SELECT provider_ref.id, 'Photobooth Premium', 'Photobooth', 2, 'available', 290, 500
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM items WHERE name = 'Photobooth Premium'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO items (user_id, name, category, stock, status, price, deposit)
SELECT provider_ref.id, 'Videobooth 360', 'Videobooth', 1, 'available', 390, 700
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM items WHERE name = 'Videobooth 360'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO items (user_id, name, category, stock, status, price, deposit)
SELECT provider_ref.id, 'Trottinette Electrique', 'Mobilite', 6, 'available', 45, 150
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM items WHERE name = 'Trottinette Electrique'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
camille AS (
  SELECT id FROM clients WHERE email = 'camille@example.com'
),
photobooth AS (
  SELECT id FROM items WHERE name = 'Photobooth Premium'
)
INSERT INTO reservations (user_id, client_id, item_id, start_date, end_date, status, total_amount, notes)
SELECT
  provider_ref.id,
  camille.id,
  photobooth.id,
  NOW() + INTERVAL '2 days',
  NOW() + INTERVAL '3 days',
  'confirmed',
  290,
  'Mariage printemps - prestation photobooth'
FROM provider_ref, camille, photobooth
WHERE NOT EXISTS (
  SELECT 1 FROM reservations WHERE notes = 'Mariage printemps - prestation photobooth'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
julien AS (
  SELECT id FROM clients WHERE email = 'julien@example.com'
),
trottinette AS (
  SELECT id FROM items WHERE name = 'Trottinette Electrique'
)
INSERT INTO reservations (user_id, client_id, item_id, start_date, end_date, status, total_amount, notes)
SELECT
  provider_ref.id,
  julien.id,
  trottinette.id,
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '6 days',
  'draft',
  45,
  'Reservation week-end mobilite'
FROM provider_ref, julien, trottinette
WHERE NOT EXISTS (
  SELECT 1 FROM reservations WHERE notes = 'Reservation week-end mobilite'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO lokify_billing_settings (
  user_id,
  lokify_plan_id,
  lokify_plan_name,
  lokify_plan_price,
  lokify_plan_interval,
  lokify_subscription_start_at,
  lokify_subscription_end_at,
  lokify_stripe_customer_id,
  lokify_stripe_subscription_id,
  billing_environment,
  lokify_subscription_status,
  subscription_locked,
  access_restricted_by_subscription,
  cancel_at_period_end
)
SELECT
  provider_ref.id,
  'pro',
  'Pro',
  59,
  'month',
  NOW() - INTERVAL '2 days',
  NOW() + INTERVAL '28 days',
  'cus_demo_lokify_4242',
  'sub_demo_lokify_4242',
  'test',
  'active',
  FALSE,
  FALSE,
  FALSE
FROM provider_ref
ON CONFLICT (user_id) DO UPDATE
SET
  lokify_plan_id = EXCLUDED.lokify_plan_id,
  lokify_plan_name = EXCLUDED.lokify_plan_name,
  lokify_plan_price = EXCLUDED.lokify_plan_price,
  lokify_plan_interval = EXCLUDED.lokify_plan_interval,
  lokify_subscription_start_at = EXCLUDED.lokify_subscription_start_at,
  lokify_subscription_end_at = EXCLUDED.lokify_subscription_end_at,
  lokify_stripe_customer_id = EXCLUDED.lokify_stripe_customer_id,
  lokify_stripe_subscription_id = EXCLUDED.lokify_stripe_subscription_id,
  billing_environment = EXCLUDED.billing_environment,
  lokify_subscription_status = EXCLUDED.lokify_subscription_status,
  subscription_locked = EXCLUDED.subscription_locked,
  access_restricted_by_subscription = EXCLUDED.access_restricted_by_subscription,
  cancel_at_period_end = EXCLUDED.cancel_at_period_end;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO customer_payment_settings (
  user_id,
  customer_payments_enabled,
  customer_stripe_mode,
  customer_stripe_account_id,
  customer_stripe_account_status,
  customer_stripe_configured_at,
  customer_payment_status,
  customer_last_payment_at,
  customer_next_payment_due_at,
  customer_payment_method_label,
  customer_payment_status_updated_at
)
SELECT
  provider_ref.id,
  FALSE,
  'test',
  'acct_demo_4242',
  'configured',
  NOW() - INTERVAL '25 days',
  'paid',
  NOW() - INTERVAL '2 days',
  NOW() + INTERVAL '28 days',
  'Carte Visa se terminant par 4242',
  NOW() - INTERVAL '2 days'
FROM provider_ref
ON CONFLICT (user_id) DO UPDATE
SET
  customer_payments_enabled = EXCLUDED.customer_payments_enabled,
  customer_stripe_mode = EXCLUDED.customer_stripe_mode,
  customer_stripe_account_id = EXCLUDED.customer_stripe_account_id,
  customer_stripe_account_status = EXCLUDED.customer_stripe_account_status,
  customer_stripe_configured_at = EXCLUDED.customer_stripe_configured_at,
  customer_payment_status = EXCLUDED.customer_payment_status,
  customer_last_payment_at = EXCLUDED.customer_last_payment_at,
  customer_next_payment_due_at = EXCLUDED.customer_next_payment_due_at,
  customer_payment_method_label = EXCLUDED.customer_payment_method_label,
  customer_payment_status_updated_at = EXCLUDED.customer_payment_status_updated_at;

WITH super_admin_ref AS (
  SELECT id FROM users WHERE email = 'team@lokify.fr'
)
INSERT INTO super_admin_stripe_settings (
  settings_key,
  subscription_price_ids_json,
  updated_by
)
SELECT 'platform', '{}', super_admin_ref.id
FROM super_admin_ref
ON CONFLICT (settings_key) DO NOTHING;
