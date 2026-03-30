CREATE TABLE IF NOT EXISTS delivery_tours (
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

CREATE INDEX IF NOT EXISTS delivery_tours_user_schedule_idx
  ON delivery_tours (user_id, scheduled_for);

CREATE TABLE IF NOT EXISTS delivery_assignments (
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

CREATE INDEX IF NOT EXISTS delivery_assignments_tour_sort_idx
  ON delivery_assignments (tour_id, sort_order);

CREATE TABLE IF NOT EXISTS delivery_stops (
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

CREATE INDEX IF NOT EXISTS delivery_stops_tour_sort_idx
  ON delivery_stops (tour_id, sort_order);
