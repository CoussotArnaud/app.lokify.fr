export const ensureStorefrontSchema = async (pool) => {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS storefront_settings (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        slug TEXT NOT NULL UNIQUE,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        reservation_approval_mode TEXT NOT NULL DEFAULT 'manual',
        slug_updated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_storefront_settings_slug ON storefront_settings(slug)",
    "CREATE INDEX IF NOT EXISTS idx_storefront_settings_published ON storefront_settings(is_published)",
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
