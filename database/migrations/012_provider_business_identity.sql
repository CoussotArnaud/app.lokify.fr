ALTER TABLE users
ADD COLUMN IF NOT EXISTS company_name TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS siret TEXT;

UPDATE users
SET company_name = full_name
WHERE account_role = 'provider'
  AND company_name IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_siret_unique
ON users(siret)
WHERE siret IS NOT NULL;
