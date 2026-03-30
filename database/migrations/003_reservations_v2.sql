ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS reference TEXT;

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'pickup';

UPDATE reservations
SET reference = 'RSV-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
WHERE COALESCE(reference, '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_user_reference
ON reservations(user_id, reference);

CREATE TABLE IF NOT EXISTS reservation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_lines_reservation_id
ON reservation_lines(reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservation_lines_user_id
ON reservation_lines(user_id);

CREATE INDEX IF NOT EXISTS idx_reservation_lines_item_id
ON reservation_lines(item_id);

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
  reservations.id,
  reservations.user_id,
  reservations.item_id,
  1,
  COALESCE(items.price, 0),
  COALESCE(reservations.total_amount, 0),
  0
FROM reservations
INNER JOIN items ON items.id = reservations.item_id
WHERE NOT EXISTS (
  SELECT 1
  FROM reservation_lines
  WHERE reservation_lines.reservation_id = reservations.id
);

DROP TRIGGER IF EXISTS reservation_lines_set_updated_at ON reservation_lines;
CREATE TRIGGER reservation_lines_set_updated_at
BEFORE UPDATE ON reservation_lines
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
