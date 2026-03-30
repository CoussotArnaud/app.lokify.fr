CREATE TABLE IF NOT EXISTS storefront_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  reservation_approval_mode TEXT NOT NULL DEFAULT 'manual',
  slug_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT storefront_settings_approval_mode_check
    CHECK (reservation_approval_mode IN ('manual', 'automatic'))
);

CREATE INDEX IF NOT EXISTS idx_storefront_settings_slug
ON storefront_settings(slug);

CREATE INDEX IF NOT EXISTS idx_storefront_settings_published
ON storefront_settings(is_published);

DROP TRIGGER IF EXISTS storefront_settings_set_updated_at ON storefront_settings;
CREATE TRIGGER storefront_settings_set_updated_at
BEFORE UPDATE ON storefront_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS catalog_tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate NUMERIC(5, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'none',
  discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_pack_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES catalog_packs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_pack_products_unique UNIQUE (pack_id, item_id)
);

ALTER TABLE catalog_categories
ADD COLUMN IF NOT EXISTS icon_name TEXT;

ALTER TABLE catalog_categories
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE item_profiles
ADD COLUMN IF NOT EXISTS tax_rate_id UUID;

ALTER TABLE item_profiles
ADD COLUMN IF NOT EXISTS long_description TEXT;

ALTER TABLE item_profiles
ADD COLUMN IF NOT EXISTS price_custom_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE item_profiles
ADD COLUMN IF NOT EXISTS options_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE item_profiles
ADD COLUMN IF NOT EXISTS variants_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE item_profiles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE item_profiles
ADD COLUMN IF NOT EXISTS reservable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE item_profiles
ALTER COLUMN vat DROP DEFAULT;

ALTER TABLE item_profiles
ALTER COLUMN vat DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_tax_rates_user_id
ON catalog_tax_rates(user_id);

CREATE INDEX IF NOT EXISTS idx_catalog_tax_rates_user_id_active
ON catalog_tax_rates(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_catalog_packs_user_id
ON catalog_packs(user_id);

CREATE INDEX IF NOT EXISTS idx_catalog_pack_products_pack_id
ON catalog_pack_products(pack_id);

CREATE INDEX IF NOT EXISTS idx_catalog_pack_products_user_id
ON catalog_pack_products(user_id);
