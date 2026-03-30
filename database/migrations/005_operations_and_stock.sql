CREATE TABLE IF NOT EXISTS product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  condition_notes TEXT,
  last_known_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_units_status_check
    CHECK (status IN ('available', 'out', 'maintenance', 'unavailable')),
  CONSTRAINT product_units_item_label_unique UNIQUE (item_id, label)
);

CREATE INDEX IF NOT EXISTS idx_product_units_user_id
ON product_units(user_id);

CREATE INDEX IF NOT EXISTS idx_product_units_item_id
ON product_units(item_id);

CREATE TABLE IF NOT EXISTS reservation_line_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_line_id UUID NOT NULL REFERENCES reservation_lines(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_unit_id UUID NOT NULL REFERENCES product_units(id) ON DELETE RESTRICT,
  assignment_status TEXT NOT NULL DEFAULT 'departed',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservation_line_units_assignment_status_check
    CHECK (assignment_status IN ('departed', 'returned')),
  CONSTRAINT reservation_line_units_unique_assignment UNIQUE (reservation_line_id, product_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_line_units_reservation_id
ON reservation_line_units(reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservation_line_units_product_unit_id
ON reservation_line_units(product_unit_id);

CREATE TABLE IF NOT EXISTS reservation_departures (
  reservation_id UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservation_departures_status_check
    CHECK (status IN ('pending', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_reservation_departures_user_id
ON reservation_departures(user_id);

CREATE TABLE IF NOT EXISTS reservation_returns (
  reservation_id UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservation_returns_status_check
    CHECK (status IN ('pending', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_reservation_returns_user_id
ON reservation_returns(user_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_movements_quantity_check CHECK (quantity > 0),
  CONSTRAINT stock_movements_type_check
    CHECK (movement_type IN ('unit_created', 'availability_change', 'departure', 'return'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id_occurred_at
ON stock_movements(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id
ON stock_movements(item_id);

DROP TRIGGER IF EXISTS product_units_set_updated_at ON product_units;
CREATE TRIGGER product_units_set_updated_at
BEFORE UPDATE ON product_units
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reservation_line_units_set_updated_at ON reservation_line_units;
CREATE TRIGGER reservation_line_units_set_updated_at
BEFORE UPDATE ON reservation_line_units
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reservation_departures_set_updated_at ON reservation_departures;
CREATE TRIGGER reservation_departures_set_updated_at
BEFORE UPDATE ON reservation_departures
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reservation_returns_set_updated_at ON reservation_returns;
CREATE TRIGGER reservation_returns_set_updated_at
BEFORE UPDATE ON reservation_returns
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
