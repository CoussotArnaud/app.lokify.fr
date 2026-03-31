export const ensureStorefrontSchema = async (pool) => {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS storefront_settings (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        slug TEXT NOT NULL UNIQUE,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        reservation_approval_mode TEXT NOT NULL DEFAULT 'manual',
        map_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        map_address TEXT,
        reviews_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        reviews_url TEXT,
        slug_updated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    "ALTER TABLE storefront_settings ADD COLUMN IF NOT EXISTS map_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE storefront_settings ADD COLUMN IF NOT EXISTS map_address TEXT",
    "ALTER TABLE storefront_settings ADD COLUMN IF NOT EXISTS reviews_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE storefront_settings ADD COLUMN IF NOT EXISTS reviews_url TEXT",
    "CREATE INDEX IF NOT EXISTS idx_storefront_settings_slug ON storefront_settings(slug)",
    "CREATE INDEX IF NOT EXISTS idx_storefront_settings_published ON storefront_settings(is_published)",
    `
      CREATE TABLE IF NOT EXISTS storefront_checkout_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stripe_session_id TEXT NOT NULL UNIQUE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        storefront_slug TEXT NOT NULL,
        stripe_account_id TEXT NOT NULL,
        checkout_status TEXT NOT NULL DEFAULT 'pending',
        amount_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
        deposit_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
        request_payload_json TEXT NOT NULL DEFAULT '{}',
        reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
        checkout_url TEXT,
        checkout_completed_at TIMESTAMPTZ,
        finalized_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_storefront_checkout_sessions_user_created_at ON storefront_checkout_sessions(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_storefront_checkout_sessions_slug_created_at ON storefront_checkout_sessions(storefront_slug, created_at DESC)",
  ];

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (
        /already exists/i.test(error.message) ||
        /does not exist/i.test(error.message) ||
        /duplicate/i.test(error.message)
      ) {
        continue;
      }

      throw error;
    }
  }
};
