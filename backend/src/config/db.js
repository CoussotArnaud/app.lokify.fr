import crypto from "crypto";

import bcrypt from "bcryptjs";
import { newDb } from "pg-mem";
import pg from "pg";

import env from "./env.js";

const { Pool } = pg;

const createMemoryPool = async () => {
  const database = newDb({
    autoCreateForeignKeyIndices: true,
  });
  const { Pool: MemoryPool } = database.adapters.createPg();
  const memoryPool = new MemoryPool();

  await memoryPool.query(`
    CREATE TABLE users (
      id UUID PRIMARY KEY,
      full_name TEXT NOT NULL,
      company_name TEXT,
      siret TEXT,
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
      siren TEXT,
      commercial_name TEXT,
      ape_code TEXT,
      establishment_admin_status TEXT,
      sirene_verification_status TEXT NOT NULL DEFAULT 'not_checked',
      sirene_verified_at TIMESTAMPTZ,
      sirene_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE clients (
      id UUID PRIMARY KEY,
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

    CREATE TABLE items (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'available',
      price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      deposit NUMERIC(10, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE catalog_categories (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category_type TEXT NOT NULL DEFAULT 'Catalogue',
      description TEXT,
      filters_json TEXT NOT NULL DEFAULT '[]',
      inspection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      durations_json TEXT NOT NULL DEFAULT '[]',
      ranges_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'custom',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_categories_slug_unique UNIQUE (user_id, slug)
    );

    CREATE TABLE item_profiles (
      item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vat NUMERIC(5, 2) NOT NULL DEFAULT 20,
      internal_description TEXT,
      serial_tracking BOOLEAN NOT NULL DEFAULT FALSE,
      assignment_order TEXT NOT NULL DEFAULT 'auto',
      availability_note TEXT,
      category_slug TEXT,
      category_name TEXT,
      subcategory TEXT,
      features TEXT,
      custom_filters TEXT,
      documents_json TEXT NOT NULL DEFAULT '[]',
      questionnaire TEXT,
      inspection_template TEXT,
      price_weekend NUMERIC(10, 2) NOT NULL DEFAULT 0,
      price_week NUMERIC(10, 2) NOT NULL DEFAULT 0,
      custom_price_note TEXT,
      online_visible BOOLEAN NOT NULL DEFAULT FALSE,
      public_name TEXT,
      public_description TEXT,
      photos_json TEXT NOT NULL DEFAULT '[]',
      related_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      related_product_ids_json TEXT NOT NULL DEFAULT '[]',
      related_sort_note TEXT,
      catalog_mode TEXT NOT NULL DEFAULT 'location',
      sku TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE reservations (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
      reference TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      fulfillment_mode TEXT NOT NULL DEFAULT 'pickup',
      start_date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE custom_statuses (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT custom_statuses_user_code_unique UNIQUE (user_id, code)
    );

    CREATE TABLE reservation_lines (
      id UUID PRIMARY KEY,
      reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      line_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE reservation_deposits (
      reservation_id UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      handling_mode TEXT NOT NULL DEFAULT 'manual',
      calculated_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      manual_status TEXT NOT NULL DEFAULT 'not_required',
      manual_method TEXT,
      manual_reference TEXT,
      notes TEXT,
      collected_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE product_units (
      id UUID PRIMARY KEY,
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      serial_number TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      condition_notes TEXT,
      last_known_location TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT product_units_item_label_unique UNIQUE (item_id, label)
    );

    CREATE TABLE reservation_line_units (
      id UUID PRIMARY KEY,
      reservation_line_id UUID NOT NULL REFERENCES reservation_lines(id) ON DELETE CASCADE,
      reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_unit_id UUID NOT NULL REFERENCES product_units(id) ON DELETE RESTRICT,
      assignment_status TEXT NOT NULL DEFAULT 'departed',
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      returned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT reservation_line_units_unique_assignment UNIQUE (reservation_line_id, product_unit_id)
    );

    CREATE TABLE reservation_departures (
      reservation_id UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      processed_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE reservation_returns (
      reservation_id UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      processed_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE stock_movements (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
      reservation_line_id UUID REFERENCES reservation_lines(id) ON DELETE SET NULL,
      product_unit_id UUID REFERENCES product_units(id) ON DELETE SET NULL,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      from_state TEXT,
      to_state TEXT,
      notes TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE delivery_tours (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      driver TEXT,
      area TEXT NOT NULL,
      scheduled_for TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE delivery_assignments (
      id UUID PRIMARY KEY,
      tour_id UUID NOT NULL REFERENCES delivery_tours(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      assignment_type TEXT NOT NULL DEFAULT 'delivery',
      stop_label TEXT NOT NULL,
      stop_address TEXT,
      scheduled_slot TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT delivery_assignments_unique UNIQUE (tour_id, reservation_id, assignment_type)
    );

    CREATE TABLE delivery_stops (
      id UUID PRIMARY KEY,
      tour_id UUID NOT NULL REFERENCES delivery_tours(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignment_id UUID REFERENCES delivery_assignments(id) ON DELETE SET NULL,
      stop_kind TEXT NOT NULL DEFAULT 'custom',
      label TEXT NOT NULL,
      address TEXT,
      scheduled_slot TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE lokify_billing_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      lokify_plan_id TEXT,
      lokify_plan_name TEXT,
      lokify_plan_price NUMERIC(10, 2),
      lokify_plan_interval TEXT NOT NULL DEFAULT 'month',
      lokify_subscription_status TEXT NOT NULL DEFAULT 'inactive',
      lokify_subscription_start_at TIMESTAMPTZ,
      lokify_subscription_end_at TIMESTAMPTZ,
      requested_lokify_plan_id TEXT,
      requested_lokify_plan_name TEXT,
      requested_lokify_plan_price NUMERIC(10, 2),
      requested_lokify_plan_interval TEXT,
      requested_lokify_plan_note TEXT,
      requested_lokify_plan_requested_at TIMESTAMPTZ,
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

    CREATE TABLE customer_payment_settings (
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

    CREATE TABLE password_reset_tokens (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      delivery_mode TEXT NOT NULL DEFAULT 'log',
      delivery_reference TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE super_admin_stripe_settings (
      settings_key TEXT PRIMARY KEY,
      stripe_publishable_key TEXT,
      stripe_secret_key_encrypted TEXT,
      stripe_webhook_secret_encrypted TEXT,
      subscription_price_ids_json TEXT NOT NULL DEFAULT '{}',
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE lokify_checkout_sessions (
      session_id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      lokify_plan_id TEXT NOT NULL,
      lokify_plan_name TEXT NOT NULL,
      lokify_plan_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
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

    CREATE TABLE lokify_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE support_tickets (
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

    CREATE TABLE support_ticket_messages (
      id UUID PRIMARY KEY,
      ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE support_notifications (
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

    CREATE TABLE domain_events (
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

    CREATE TABLE reservation_documents (
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
      content_text TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT reservation_documents_unique_type UNIQUE (reservation_id, document_type)
    );

    CREATE TABLE client_documents (
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
  `);

  const superAdminId = crypto.randomUUID();
  const providerId = crypto.randomUUID();
  const camilleId = crypto.randomUUID();
  const julienId = crypto.randomUUID();
  const photoboothId = crypto.randomUUID();
  const videoboothId = crypto.randomUUID();
  const trottinetteId = crypto.randomUUID();
  const reservationOneId = crypto.randomUUID();
  const reservationTwoId = crypto.randomUUID();
  const reservationLineOneId = crypto.randomUUID();
  const reservationLineTwoId = crypto.randomUUID();
  const productUnitOneId = crypto.randomUUID();
  const productUnitTwoId = crypto.randomUUID();
  const deliveryTourOneId = crypto.randomUUID();
  const deliveryAssignmentOneId = crypto.randomUUID();
  const deliveryStopOneId = crypto.randomUUID();
  const deliveryStopTwoId = crypto.randomUUID();
  const supportTicketOneId = crypto.randomUUID();
  const supportMessageOneId = crypto.randomUUID();
  const supportMessageTwoId = crypto.randomUUID();
  const providerNotificationOneId = crypto.randomUUID();
  const superAdminNotificationOneId = crypto.randomUUID();
  const customStatusIds = Array.from({ length: 5 }, () => crypto.randomUUID());
  const now = Date.now();
  const superAdminPasswordHash = bcrypt.hashSync(env.lokifySuperAdminPassword, 10);
  const providerPasswordHash = bcrypt.hashSync("presta", 10);

  await memoryPool.query(
    `
      INSERT INTO users (
        id,
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
        city,
        created_at,
        updated_at
      )
      VALUES ($1, $2, NULL, NULL, $3, $4, 'super_admin', 'active', NULL, NULL, NULL, NULL, NULL, NULL, NULL, $5, $5)
    `,
    [
      superAdminId,
      "Admin Lokify",
      env.lokifySuperAdminEmail,
      superAdminPasswordHash,
      new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO users (
        id,
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
        city,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'provider', 'active', 'Marie', 'Lefevre', '06 48 32 19 84', 'France', '18 avenue des Arts', '69006', 'Lyon', $7, $7)
    `,
    [
      providerId,
      "Prestataire Demo",
      "Prestataire Demo",
      "73282932000074",
      "presta@lokify.fr",
      providerPasswordHash,
      new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO lokify_billing_settings (
        user_id,
        lokify_plan_id,
        lokify_plan_name,
        lokify_plan_price,
        lokify_plan_interval,
        lokify_subscription_status,
        lokify_subscription_start_at,
        lokify_subscription_end_at,
        lokify_stripe_customer_id,
        lokify_stripe_subscription_id,
        billing_environment,
        subscription_locked,
        access_restricted_by_subscription,
        cancel_at_period_end,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        'pro',
        'Intermediaire',
        59,
        'month',
        'active',
        $2,
        $3,
        'cus_demo_lokify_4242',
        'sub_demo_lokify_4242',
        'test',
        FALSE,
        FALSE,
        FALSE,
        $4,
        $4
      )
    `,
    [
      providerId,
      new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now + 28 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO customer_payment_settings (
        user_id,
        customer_payments_enabled,
        customer_stripe_mode,
        customer_stripe_account_status,
        customer_stripe_account_id,
        customer_stripe_configured_at,
        customer_payment_status,
        customer_last_payment_at,
        customer_next_payment_due_at,
        customer_payment_method_label,
        customer_payment_status_updated_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        FALSE,
        'test',
        'configured',
        'acct_demo_4242',
        $2,
        'paid',
        $3,
        $4,
        'Carte Visa se terminant par 4242',
        $3,
        $2,
        $2
      )
    `,
    [
      providerId,
      new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now + 28 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO super_admin_stripe_settings (
        settings_key,
        subscription_price_ids_json,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ('platform', '{}', $1, $2, $2)
    `,
    [superAdminId, new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString()]
  );

  await memoryPool.query(
    `
      INSERT INTO clients (id, user_id, first_name, last_name, email, phone, address, notes, created_at, updated_at)
      VALUES
        ($1, $2, 'Camille', 'Martin', 'camille@example.com', '0612345678', '12 rue des Fleurs, Paris', 'Cliente evenementiel', $3, $3),
        ($4, $2, 'Julien', 'Robert', 'julien@example.com', '0687654321', '4 avenue Victor Hugo, Lyon', 'Location trottinettes week-end', $5, $5)
    `,
    [
      camilleId,
      providerId,
      new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
      julienId,
      new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO items (id, user_id, name, category, stock, status, price, deposit, created_at, updated_at)
      VALUES
        ($1, $2, 'Photobooth Premium', 'Photobooth', 2, 'available', 290, 500, $3, $3),
        ($4, $2, 'Videobooth 360', 'Videobooth', 1, 'available', 390, 700, $5, $5),
        ($6, $2, 'Trottinette Electrique', 'Mobilite', 6, 'available', 45, 150, $7, $7)
    `,
    [
      photoboothId,
      providerId,
      new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
      videoboothId,
      new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      trottinetteId,
      new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO catalog_categories (
        id,
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
        source,
        created_at,
        updated_at
      )
      VALUES
        ($1, $2, 'animation-photo', 'Animation photo', 'Evenementiel', 'Bornes et experiences selfie pour activations.', '["format","impression","branding"]', TRUE, '[{"label":"Journee","hours":10}]', '[{"label":"Week-end","minHours":24,"maxHours":48}]', 'active', 'seed', $3, $3),
        ($4, $2, 'video-scene', 'Video & scene', 'Experience premium', 'Videobooths et experiences videos pour evenements.', '["captation","rotation","livraison"]', TRUE, '[{"label":"Session","hours":6}]', '[{"label":"Production","minHours":12,"maxHours":36}]', 'active', 'seed', $5, $5),
        ($6, $2, 'mobilite-evenementielle', 'Mobilite evenementielle', 'Mobilite', 'Trottinettes et circulation sur site.', '["autonomie","zone","assurance"]', FALSE, '[{"label":"Journee","hours":10}]', '[{"label":"Longue duree","minHours":72,"maxHours":240}]', 'active', 'seed', $7, $7)
    `,
    [
      crypto.randomUUID(),
      providerId,
      new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
      crypto.randomUUID(),
      new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      crypto.randomUUID(),
      new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
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
        sku,
        created_at,
        updated_at
      )
      VALUES
        ($1, $2, 20, TRUE, 'animation-photo', 'Animation photo', 490, 1490, TRUE, 'Photobooth Premium', 'Borne photo premium prete a etre reservee en ligne.', 'location', 'REF-PHOTO-PREMIUM', $3, $3),
        ($4, $2, 20, FALSE, 'video-scene', 'Video & scene', 690, 1990, TRUE, 'Videobooth 360', 'Experience video immersive pour activations premium.', 'location', 'REF-VIDEO-360', $5, $5),
        ($6, $2, 20, FALSE, 'mobilite-evenementielle', 'Mobilite evenementielle', 85, 250, FALSE, 'Trottinette Electrique', 'Solution de mobilite pour circulation sur site.', 'location', 'REF-MOBILITE-TROT', $7, $7)
    `,
    [
      photoboothId,
      providerId,
      new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
      videoboothId,
      new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      trottinetteId,
      new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO custom_statuses (
        id,
        user_id,
        code,
        label,
        color,
        position,
        created_at,
        updated_at
      )
      VALUES
        ($1, $6, 'pending', 'Non paye / En attente', '#D64F4F', 0, $7, $7),
        ($2, $6, 'draft', 'A finaliser', '#E39B2E', 1, $7, $7),
        ($3, $6, 'confirmed', 'Confirme / Pret', '#1C9C6B', 2, $7, $7),
        ($4, $6, 'completed', 'Termine', '#2F7DE1', 3, $7, $7),
        ($5, $6, 'cancelled', 'Annule', '#7A869A', 4, $7, $7)
    `,
    [
      customStatusIds[0],
      customStatusIds[1],
      customStatusIds[2],
      customStatusIds[3],
      customStatusIds[4],
      providerId,
      new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO reservations (
        id,
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
        notes,
        created_at,
        updated_at
      )
      VALUES
        ($1, $2, $3, $4, 'RSV-DEMO-001', 'manual', 'pickup', $5, $6, 'confirmed', 290, 'Mariage printemps - prestation photobooth', $7, $7),
        ($8, $2, $9, $10, 'RSV-DEMO-002', 'manual', 'pickup', $11, $12, 'draft', 45, 'Reservation week-end mobilite', $13, $13)
    `,
    [
      reservationOneId,
      providerId,
      camilleId,
      photoboothId,
      new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      reservationTwoId,
      julienId,
      trottinetteId,
      new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO reservation_lines (
        id,
        reservation_id,
        user_id,
        item_id,
        quantity,
        unit_price,
        line_total,
        sort_order,
        created_at,
        updated_at
      )
      VALUES
        ($1, $2, $3, $4, 1, 290, 290, 0, $5, $5),
        ($6, $7, $3, $8, 1, 45, 45, 0, $9, $9)
    `,
    [
      reservationLineOneId,
      reservationOneId,
      providerId,
      photoboothId,
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      reservationLineTwoId,
      reservationTwoId,
      trottinetteId,
      new Date(now).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO reservation_deposits (
        reservation_id,
        user_id,
        handling_mode,
        calculated_amount,
        manual_status,
        created_at,
        updated_at
      )
      VALUES
        ($1, $3, 'manual', 500, 'pending', $4, $4),
        ($2, $3, 'manual', 150, 'pending', $5, $5)
    `,
    [
      reservationOneId,
      reservationTwoId,
      providerId,
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      new Date(now).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO product_units (
        id,
        item_id,
        user_id,
        label,
        serial_number,
        status,
        condition_notes,
        last_known_location,
        created_at,
        updated_at
      )
      VALUES
        ($1, $3, $5, 'Photobooth Premium #001', 'PB-001', 'available', 'Unite prete au depart', 'Depot LOKIFY', $6, $6),
        ($2, $4, $5, 'Photobooth Premium #002', 'PB-002', 'available', 'Unite prete au depart', 'Depot LOKIFY', $7, $7)
    `,
    [
      productUnitOneId,
      productUnitTwoId,
      photoboothId,
      photoboothId,
      providerId,
      new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO delivery_tours (
        id,
        user_id,
        name,
        driver,
        area,
        scheduled_for,
        status,
        notes,
        created_at,
        updated_at
      )
      VALUES
        ($1, $2, 'Tournee photo du matin', 'Equipe logistique A', 'Paris centre', $3, 'planned', 'Livraison prioritaire du photobooth.', $4, $4)
    `,
    [
      deliveryTourOneId,
      providerId,
      new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      new Date(now - 12 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
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
        sort_order,
        created_at,
        updated_at
      )
      VALUES
        ($1, $2, $3, $4, 'delivery', 'Camille Martin · Livraison', '12 rue des Fleurs, Paris', '09:15', 'planned', 1, $5, $5)
    `,
    [
      deliveryAssignmentOneId,
      deliveryTourOneId,
      providerId,
      reservationOneId,
      new Date(now - 12 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
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
        notes,
        created_at,
        updated_at
      )
      VALUES
        ($1, $3, $5, NULL, 'depot', 'Preparation depot', 'Depot LOKIFY', '07:30', 'planned', 0, 'Chargement et controle du materiel.', $6, $6),
        ($2, $3, $5, $4, 'delivery', 'Camille Martin · Livraison', '12 rue des Fleurs, Paris', '09:15', 'planned', 1, 'Installation client.', $7, $7)
    `,
    [
      deliveryStopOneId,
      deliveryStopTwoId,
      deliveryTourOneId,
      deliveryAssignmentOneId,
      providerId,
      new Date(now - 12 * 60 * 60 * 1000).toISOString(),
      new Date(now - 11 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
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
      VALUES (
        $1,
        'SUP-DEMO-001',
        $2,
        $2,
        'Question sur la formule Pro',
        'billing',
        'in_progress',
        $3,
        $4,
        $3
      )
    `,
    [
      supportTicketOneId,
      providerId,
      new Date(now - 8 * 60 * 60 * 1000).toISOString(),
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO support_ticket_messages (
        id,
        ticket_id,
        user_id,
        author_role,
        body,
        created_at,
        updated_at
      )
      VALUES
        (
          $1,
          $2,
          $3,
          'provider',
          'Bonjour, je souhaite comprendre les differences entre ma formule actuelle et la formule Premium avant de changer.',
          $5,
          $5
        ),
        (
          $4,
          $2,
          $6,
          'super_admin',
          'Bonjour, nous avons bien pris votre demande. Vous pouvez deja comparer les formules dans Facturation, et nous pouvons corriger manuellement si besoin.',
          $7,
          $7
        )
    `,
    [
      supportMessageOneId,
      supportTicketOneId,
      providerId,
      supportMessageTwoId,
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      superAdminId,
      new Date(now - 8 * 60 * 60 * 1000).toISOString(),
    ]
  );

  await memoryPool.query(
    `
      INSERT INTO support_notifications (
        id,
        user_id,
        ticket_id,
        notification_type,
        title,
        body,
        read_at,
        created_at,
        updated_at
      )
      VALUES
        (
          $1,
          $2,
          $3,
          'support_ticket_created',
          'Nouveau ticket support',
          'Prestataire Demo a cree le ticket "Question sur la formule Pro".',
          NULL,
          $4,
          $4
        ),
        (
          $5,
          $6,
          $3,
          'support_ticket_reply',
          'Nouvelle reponse du support',
          'Le support Lokify a repondu au ticket "Question sur la formule Pro".',
          NULL,
          $7,
          $7
        )
    `,
    [
      superAdminNotificationOneId,
      superAdminId,
      supportTicketOneId,
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      providerNotificationOneId,
      providerId,
      new Date(now - 8 * 60 * 60 * 1000).toISOString(),
    ]
  );

  return memoryPool;
};

const createPostgresPool = () => {
  const connectionOptions = env.databaseUrl
    ? { connectionString: env.databaseUrl }
    : {
        host: env.databaseHost,
        port: env.databasePort,
        user: env.databaseUser,
        password: env.databasePassword,
        database: env.databaseName,
      };

  if (env.databaseSsl) {
    connectionOptions.ssl = {
      rejectUnauthorized: env.databaseSslRejectUnauthorized,
    };
  }

  return new Pool(connectionOptions);
};

export const pool =
  env.databaseMode === "memory" ? await createMemoryPool() : createPostgresPool();

export const query = (text, params = []) => pool.query(text, params);
