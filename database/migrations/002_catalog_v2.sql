CREATE TABLE IF NOT EXISTS catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS item_profiles (
  item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vat NUMERIC(5, 2) NOT NULL DEFAULT 20 CHECK (vat >= 0),
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
  price_weekend NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price_weekend >= 0),
  price_week NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price_week >= 0),
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

CREATE INDEX IF NOT EXISTS idx_catalog_categories_user_id
ON catalog_categories(user_id);

CREATE INDEX IF NOT EXISTS idx_catalog_categories_user_id_slug
ON catalog_categories(user_id, slug);

CREATE INDEX IF NOT EXISTS idx_item_profiles_user_id
ON item_profiles(user_id);

DROP TRIGGER IF EXISTS catalog_categories_set_updated_at ON catalog_categories;
CREATE TRIGGER catalog_categories_set_updated_at
BEFORE UPDATE ON catalog_categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS item_profiles_set_updated_at ON item_profiles;
CREATE TRIGGER item_profiles_set_updated_at
BEFORE UPDATE ON item_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
