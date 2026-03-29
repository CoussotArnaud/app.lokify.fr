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
    company_name,
    siret,
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
    'Prestataire Demo',
    '73282932000074',
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
    company_name = EXCLUDED.company_name,
    siret = EXCLUDED.siret,
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
)
INSERT INTO catalog_categories (
  user_id,
  slug,
  name,
  category_type,
  description,
  filters_json,
  inspection_enabled,
  durations_json,
  ranges_json,
  status,
  source
)
SELECT
  provider_ref.id,
  'animation-photo',
  'Animation photo',
  'Evenementiel',
  'Bornes, experiences selfie et activations photo.',
  '["format","impression","branding"]',
  TRUE,
  '[{"label":"Journee","hours":10}]',
  '[{"label":"Week-end","minHours":24,"maxHours":48}]',
  'active',
  'seed'
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_categories
  WHERE user_id = provider_ref.id
    AND slug = 'animation-photo'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO catalog_categories (
  user_id,
  slug,
  name,
  category_type,
  description,
  filters_json,
  inspection_enabled,
  durations_json,
  ranges_json,
  status,
  source
)
SELECT
  provider_ref.id,
  'video-scene',
  'Video & scene',
  'Experience premium',
  'Videobooths et experiences videos pour les evenements.',
  '["captation","rotation","livraison"]',
  TRUE,
  '[{"label":"Session","hours":6}]',
  '[{"label":"Production","minHours":12,"maxHours":36}]',
  'active',
  'seed'
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_categories
  WHERE user_id = provider_ref.id
    AND slug = 'video-scene'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO catalog_categories (
  user_id,
  slug,
  name,
  category_type,
  description,
  filters_json,
  inspection_enabled,
  durations_json,
  ranges_json,
  status,
  source
)
SELECT
  provider_ref.id,
  'mobilite-evenementielle',
  'Mobilite evenementielle',
  'Mobilite',
  'Trottinettes et solutions de circulation sur site.',
  '["autonomie","zone","assurance"]',
  FALSE,
  '[{"label":"Journee","hours":10}]',
  '[{"label":"Longue duree","minHours":72,"maxHours":240}]',
  'active',
  'seed'
FROM provider_ref
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_categories
  WHERE user_id = provider_ref.id
    AND slug = 'mobilite-evenementielle'
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
photobooth AS (
  SELECT id FROM items WHERE name = 'Photobooth Premium'
)
INSERT INTO item_profiles (
  item_id,
  user_id,
  vat,
  serial_tracking,
  category_slug,
  category_name,
  price_weekend,
  price_week,
  online_visible,
  public_name,
  public_description,
  catalog_mode,
  sku
)
SELECT
  photobooth.id,
  provider_ref.id,
  20,
  TRUE,
  'animation-photo',
  'Animation photo',
  490,
  1490,
  TRUE,
  'Photobooth Premium',
  'Borne photo premium prete a etre reservee en ligne.',
  'location',
  'REF-PHOTO-PREMIUM'
FROM provider_ref, photobooth
WHERE NOT EXISTS (
  SELECT 1 FROM item_profiles WHERE item_id = photobooth.id
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
videobooth AS (
  SELECT id FROM items WHERE name = 'Videobooth 360'
)
INSERT INTO item_profiles (
  item_id,
  user_id,
  vat,
  serial_tracking,
  category_slug,
  category_name,
  price_weekend,
  price_week,
  online_visible,
  public_name,
  public_description,
  catalog_mode,
  sku
)
SELECT
  videobooth.id,
  provider_ref.id,
  20,
  FALSE,
  'video-scene',
  'Video & scene',
  690,
  1990,
  TRUE,
  'Videobooth 360',
  'Experience video immersive pour les activations premium.',
  'location',
  'REF-VIDEO-360'
FROM provider_ref, videobooth
WHERE NOT EXISTS (
  SELECT 1 FROM item_profiles WHERE item_id = videobooth.id
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
trottinette AS (
  SELECT id FROM items WHERE name = 'Trottinette Electrique'
)
INSERT INTO item_profiles (
  item_id,
  user_id,
  vat,
  serial_tracking,
  category_slug,
  category_name,
  price_weekend,
  price_week,
  online_visible,
  public_name,
  public_description,
  catalog_mode,
  sku
)
SELECT
  trottinette.id,
  provider_ref.id,
  20,
  FALSE,
  'mobilite-evenementielle',
  'Mobilite evenementielle',
  85,
  250,
  FALSE,
  'Trottinette Electrique',
  'Solution de mobilite pour circulation sur site.',
  'location',
  'REF-MOBILITE-TROT'
FROM provider_ref, trottinette
WHERE NOT EXISTS (
  SELECT 1 FROM item_profiles WHERE item_id = trottinette.id
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
INSERT INTO reservations (
  user_id,
  client_id,
  item_id,
  reference,
  source,
  fulfillment_mode,
  start_date,
  end_date,
  status,
  total_amount,
  notes
)
SELECT
  provider_ref.id,
  camille.id,
  photobooth.id,
  'RSV-SEED-001',
  'manual',
  'pickup',
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
INSERT INTO reservations (
  user_id,
  client_id,
  item_id,
  reference,
  source,
  fulfillment_mode,
  start_date,
  end_date,
  status,
  total_amount,
  notes
)
SELECT
  provider_ref.id,
  julien.id,
  trottinette.id,
  'RSV-SEED-002',
  'manual',
  'pickup',
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
),
reservation_ref AS (
  SELECT id FROM reservations WHERE notes = 'Mariage printemps - prestation photobooth'
),
photobooth AS (
  SELECT id, price FROM items WHERE name = 'Photobooth Premium'
)
INSERT INTO reservation_lines (
  reservation_id,
  user_id,
  item_id,
  quantity,
  unit_price,
  line_total,
  sort_order
)
SELECT
  reservation_ref.id,
  provider_ref.id,
  photobooth.id,
  1,
  photobooth.price,
  290,
  0
FROM provider_ref, reservation_ref, photobooth
WHERE NOT EXISTS (
  SELECT 1 FROM reservation_lines WHERE reservation_id = reservation_ref.id
);

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
reservation_ref AS (
  SELECT id FROM reservations WHERE notes = 'Reservation week-end mobilite'
),
trottinette AS (
  SELECT id, price FROM items WHERE name = 'Trottinette Electrique'
)
INSERT INTO reservation_lines (
  reservation_id,
  user_id,
  item_id,
  quantity,
  unit_price,
  line_total,
  sort_order
)
SELECT
  reservation_ref.id,
  provider_ref.id,
  trottinette.id,
  1,
  trottinette.price,
  45,
  0
FROM provider_ref, reservation_ref, trottinette
WHERE NOT EXISTS (
  SELECT 1 FROM reservation_lines WHERE reservation_id = reservation_ref.id
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
  'Intermediaire',
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
INSERT INTO custom_statuses (user_id, code, label, color, position)
SELECT provider_ref.id, status_seed.code, status_seed.label, status_seed.color, status_seed.position
FROM provider_ref
CROSS JOIN (
  VALUES
    ('pending', 'Non paye / En attente', '#D64F4F', 0),
    ('draft', 'A finaliser', '#E39B2E', 1),
    ('confirmed', 'Confirme / Pret', '#1C9C6B', 2),
    ('completed', 'Termine', '#2F7DE1', 3),
    ('cancelled', 'Annule', '#7A869A', 4)
) AS status_seed(code, label, color, position)
ON CONFLICT (user_id, code) DO UPDATE
SET
  label = EXCLUDED.label,
  color = EXCLUDED.color,
  position = EXCLUDED.position;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
reservation_ref AS (
  SELECT id FROM reservations WHERE notes = 'Mariage printemps - prestation photobooth'
)
INSERT INTO reservation_deposits (
  reservation_id,
  user_id,
  handling_mode,
  calculated_amount,
  manual_status
)
SELECT reservation_ref.id, provider_ref.id, 'manual', 500, 'pending'
FROM provider_ref, reservation_ref
ON CONFLICT (reservation_id) DO UPDATE
SET
  handling_mode = EXCLUDED.handling_mode,
  calculated_amount = EXCLUDED.calculated_amount,
  manual_status = EXCLUDED.manual_status;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
reservation_ref AS (
  SELECT id FROM reservations WHERE notes = 'Reservation week-end mobilite'
)
INSERT INTO reservation_deposits (
  reservation_id,
  user_id,
  handling_mode,
  calculated_amount,
  manual_status
)
SELECT reservation_ref.id, provider_ref.id, 'manual', 150, 'pending'
FROM provider_ref, reservation_ref
ON CONFLICT (reservation_id) DO UPDATE
SET
  handling_mode = EXCLUDED.handling_mode,
  calculated_amount = EXCLUDED.calculated_amount,
  manual_status = EXCLUDED.manual_status;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
photobooth AS (
  SELECT id FROM items WHERE name = 'Photobooth Premium'
)
INSERT INTO product_units (
  item_id,
  user_id,
  label,
  serial_number,
  status,
  condition_notes,
  last_known_location
)
SELECT
  photobooth.id,
  provider_ref.id,
  unit_seed.label,
  unit_seed.serial_number,
  'available',
  'Unite prete au depart',
  'Depot LOKIFY'
FROM provider_ref, photobooth
CROSS JOIN (
  VALUES
    ('Photobooth Premium #001', 'PB-001'),
    ('Photobooth Premium #002', 'PB-002')
) AS unit_seed(label, serial_number)
ON CONFLICT (item_id, label) DO UPDATE
SET
  serial_number = EXCLUDED.serial_number,
  status = EXCLUDED.status,
  condition_notes = EXCLUDED.condition_notes,
  last_known_location = EXCLUDED.last_known_location;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
)
INSERT INTO delivery_tours (
  id,
  user_id,
  name,
  driver,
  area,
  scheduled_for,
  status,
  notes
)
SELECT
  '80000000-0000-0000-0000-000000000101',
  provider_ref.id,
  'Tournee photo du matin',
  'Equipe logistique A',
  'Paris centre',
  NOW() + INTERVAL '1 day',
  'planned',
  'Livraison prioritaire du photobooth.'
FROM provider_ref
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  driver = EXCLUDED.driver,
  area = EXCLUDED.area,
  scheduled_for = EXCLUDED.scheduled_for,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
tour_ref AS (
  SELECT id FROM delivery_tours WHERE id = '80000000-0000-0000-0000-000000000101'
),
reservation_ref AS (
  SELECT id FROM reservations WHERE notes = 'Mariage printemps - prestation photobooth'
)
INSERT INTO delivery_assignments (
  id,
  tour_id,
  user_id,
  reservation_id,
  assignment_type,
  stop_label,
  stop_address,
  scheduled_slot,
  status,
  sort_order
)
SELECT
  '80000000-0000-0000-0000-000000000102',
  tour_ref.id,
  provider_ref.id,
  reservation_ref.id,
  'delivery',
  'Camille Martin · Livraison',
  '12 rue des Fleurs, Paris',
  '09:15',
  'planned',
  1
FROM provider_ref, tour_ref, reservation_ref
ON CONFLICT (id) DO UPDATE
SET
  stop_label = EXCLUDED.stop_label,
  stop_address = EXCLUDED.stop_address,
  scheduled_slot = EXCLUDED.scheduled_slot,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
tour_ref AS (
  SELECT id FROM delivery_tours WHERE id = '80000000-0000-0000-0000-000000000101'
),
assignment_ref AS (
  SELECT id FROM delivery_assignments WHERE id = '80000000-0000-0000-0000-000000000102'
)
INSERT INTO delivery_stops (
  id,
  tour_id,
  user_id,
  assignment_id,
  stop_kind,
  label,
  address,
  scheduled_slot,
  status,
  sort_order,
  notes
)
SELECT
  stop_seed.id,
  tour_ref.id,
  provider_ref.id,
  CASE WHEN stop_seed.sort_order = 1 THEN assignment_ref.id ELSE NULL END,
  stop_seed.stop_kind,
  stop_seed.label,
  stop_seed.address,
  stop_seed.scheduled_slot,
  'planned',
  stop_seed.sort_order,
  stop_seed.notes
FROM provider_ref, tour_ref, assignment_ref
CROSS JOIN (
  VALUES
    ('80000000-0000-0000-0000-000000000103', 'depot', 'Preparation depot', 'Depot LOKIFY', '07:30', 0, 'Chargement et controle du materiel.'),
    ('80000000-0000-0000-0000-000000000104', 'delivery', 'Camille Martin · Livraison', '12 rue des Fleurs, Paris', '09:15', 1, 'Installation client.')
) AS stop_seed(id, stop_kind, label, address, scheduled_slot, sort_order, notes)
ON CONFLICT (id) DO UPDATE
SET
  assignment_id = EXCLUDED.assignment_id,
  stop_kind = EXCLUDED.stop_kind,
  label = EXCLUDED.label,
  address = EXCLUDED.address,
  scheduled_slot = EXCLUDED.scheduled_slot,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  notes = EXCLUDED.notes;

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

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
admin_ref AS (
  SELECT id FROM users WHERE email = 'team@lokify.fr'
)
INSERT INTO support_tickets (
  id,
  reference,
  provider_user_id,
  created_by_user_id,
  subject,
  category,
  status,
  last_message_at,
  created_at,
  updated_at
)
SELECT
  '90000000-0000-0000-0000-000000000101',
  'SUP-DEMO-001',
  provider_ref.id,
  provider_ref.id,
  'Question sur la formule Pro',
  'billing',
  'in_progress',
  NOW() - INTERVAL '8 hours',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '8 hours'
FROM provider_ref, admin_ref
ON CONFLICT (id) DO UPDATE
SET
  subject = EXCLUDED.subject,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  last_message_at = EXCLUDED.last_message_at,
  updated_at = EXCLUDED.updated_at;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
admin_ref AS (
  SELECT id FROM users WHERE email = 'team@lokify.fr'
),
ticket_ref AS (
  SELECT id FROM support_tickets WHERE id = '90000000-0000-0000-0000-000000000101'
)
INSERT INTO support_ticket_messages (
  id,
  ticket_id,
  user_id,
  author_role,
  body,
  created_at,
  updated_at
)
SELECT
  message_seed.id,
  ticket_ref.id,
  CASE WHEN message_seed.author_role = 'provider' THEN provider_ref.id ELSE admin_ref.id END,
  message_seed.author_role,
  message_seed.body,
  message_seed.created_at,
  message_seed.created_at
FROM provider_ref, admin_ref, ticket_ref
CROSS JOIN (
  VALUES
    (
      '90000000-0000-0000-0000-000000000102',
      'provider',
      'Bonjour, je souhaite comprendre les differences entre ma formule actuelle et la formule Premium avant de changer.',
      NOW() - INTERVAL '1 day'
    ),
    (
      '90000000-0000-0000-0000-000000000103',
      'super_admin',
      'Bonjour, nous avons bien pris votre demande. Vous pouvez deja comparer les formules dans Facturation, et nous pouvons corriger manuellement si besoin.',
      NOW() - INTERVAL '8 hours'
    )
) AS message_seed(id, author_role, body, created_at)
ON CONFLICT (id) DO UPDATE
SET
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

WITH provider_ref AS (
  SELECT id FROM users WHERE email = 'presta@lokify.fr'
),
admin_ref AS (
  SELECT id FROM users WHERE email = 'team@lokify.fr'
),
ticket_ref AS (
  SELECT id FROM support_tickets WHERE id = '90000000-0000-0000-0000-000000000101'
)
INSERT INTO support_notifications (
  id,
  user_id,
  ticket_id,
  notification_type,
  title,
  body,
  created_at,
  updated_at
)
SELECT
  notification_seed.id,
  CASE WHEN notification_seed.target_role = 'provider' THEN provider_ref.id ELSE admin_ref.id END,
  ticket_ref.id,
  notification_seed.notification_type,
  notification_seed.title,
  notification_seed.body,
  notification_seed.created_at,
  notification_seed.created_at
FROM provider_ref, admin_ref, ticket_ref
CROSS JOIN (
  VALUES
    (
      '90000000-0000-0000-0000-000000000104',
      'super_admin',
      'support_ticket_created',
      'Nouveau ticket support',
      'Prestataire Demo a cree le ticket "Question sur la formule Pro".',
      NOW() - INTERVAL '1 day'
    ),
    (
      '90000000-0000-0000-0000-000000000105',
      'provider',
      'support_ticket_reply',
      'Nouvelle reponse du support',
      'Le support Lokify a repondu au ticket "Question sur la formule Pro".',
      NOW() - INTERVAL '8 hours'
    )
) AS notification_seed(id, target_role, notification_type, title, body, created_at)
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;
