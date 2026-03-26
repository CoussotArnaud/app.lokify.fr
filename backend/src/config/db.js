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

    CREATE TABLE reservations (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
      start_date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
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
  const now = Date.now();
  const superAdminPasswordHash = bcrypt.hashSync(env.lokifySuperAdminPassword, 10);
  const providerPasswordHash = bcrypt.hashSync("presta", 10);

  await memoryPool.query(
    `
      INSERT INTO users (
        id,
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
        city,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'super_admin', 'active', NULL, NULL, NULL, NULL, NULL, NULL, NULL, $5, $5)
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
      VALUES ($1, $2, $3, $4, 'provider', 'active', 'Marie', 'Lefevre', '06 48 32 19 84', 'France', '18 avenue des Arts', '69006', 'Lyon', $5, $5)
    `,
    [
      providerId,
      "Prestataire Demo",
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
        'Pro',
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
      INSERT INTO reservations (id, user_id, client_id, item_id, start_date, end_date, status, total_amount, notes, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, 'confirmed', 290, 'Mariage printemps - prestation photobooth', $7, $7),
        ($8, $2, $9, $10, $11, $12, 'draft', 45, 'Reservation week-end mobilite', $13, $13)
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
      rejectUnauthorized: false,
    };
  }

  return new Pool(connectionOptions);
};

export const pool =
  env.databaseMode === "memory" ? await createMemoryPool() : createPostgresPool();

export const query = (text, params = []) => pool.query(text, params);
