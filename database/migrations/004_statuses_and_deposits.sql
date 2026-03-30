ALTER TABLE reservations
DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations
ADD CONSTRAINT reservations_status_check
CHECK (status IN ('draft', 'confirmed', 'completed', 'cancelled', 'pending'));

CREATE TABLE IF NOT EXISTS custom_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0 AND position < 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT custom_statuses_user_code_unique UNIQUE (user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_custom_statuses_user_id
ON custom_statuses(user_id);

CREATE TABLE IF NOT EXISTS reservation_deposits (
  reservation_id UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handling_mode TEXT NOT NULL DEFAULT 'manual',
  calculated_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (calculated_amount >= 0),
  manual_status TEXT NOT NULL DEFAULT 'not_required',
  manual_method TEXT,
  manual_reference TEXT,
  notes TEXT,
  collected_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservation_deposits_manual_status_check
    CHECK (manual_status IN ('not_required', 'pending', 'collected', 'released', 'waived')),
  CONSTRAINT reservation_deposits_handling_mode_check
    CHECK (handling_mode IN ('manual', 'stripe_ready'))
);

CREATE INDEX IF NOT EXISTS idx_reservation_deposits_user_id
ON reservation_deposits(user_id);

INSERT INTO custom_statuses (user_id, code, label, color, position)
SELECT users.id, status_seed.code, status_seed.label, status_seed.color, status_seed.position
FROM users
CROSS JOIN (
  VALUES
    ('pending', 'Non paye / En attente', '#D64F4F', 0),
    ('draft', 'A finaliser', '#E39B2E', 1),
    ('confirmed', 'Confirme / Pret', '#1C9C6B', 2),
    ('completed', 'Termine', '#2F7DE1', 3),
    ('cancelled', 'Annule', '#7A869A', 4)
) AS status_seed(code, label, color, position)
WHERE users.account_role = 'provider'
ON CONFLICT (user_id, code) DO NOTHING;

WITH line_deposits AS (
  SELECT
    reservation_lines.reservation_id,
    SUM(COALESCE(items.deposit, 0) * reservation_lines.quantity) AS calculated_amount
  FROM reservation_lines
  INNER JOIN items ON items.id = reservation_lines.item_id
  GROUP BY reservation_lines.reservation_id
),
legacy_deposits AS (
  SELECT
    reservations.id AS reservation_id,
    COALESCE(items.deposit, 0) AS calculated_amount
  FROM reservations
  INNER JOIN items ON items.id = reservations.item_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM reservation_lines
    WHERE reservation_lines.reservation_id = reservations.id
  )
)
INSERT INTO reservation_deposits (
  reservation_id,
  user_id,
  handling_mode,
  calculated_amount,
  manual_status
)
SELECT
  reservations.id,
  reservations.user_id,
  'manual',
  COALESCE(line_deposits.calculated_amount, legacy_deposits.calculated_amount, 0),
  CASE
    WHEN COALESCE(line_deposits.calculated_amount, legacy_deposits.calculated_amount, 0) > 0
      THEN 'pending'
    ELSE 'not_required'
  END
FROM reservations
LEFT JOIN line_deposits ON line_deposits.reservation_id = reservations.id
LEFT JOIN legacy_deposits ON legacy_deposits.reservation_id = reservations.id
WHERE NOT EXISTS (
  SELECT 1
  FROM reservation_deposits
  WHERE reservation_deposits.reservation_id = reservations.id
);

DROP TRIGGER IF EXISTS custom_statuses_set_updated_at ON custom_statuses;
CREATE TRIGGER custom_statuses_set_updated_at
BEFORE UPDATE ON custom_statuses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reservation_deposits_set_updated_at ON reservation_deposits;
CREATE TRIGGER reservation_deposits_set_updated_at
BEFORE UPDATE ON reservation_deposits
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
