# APP.LOKIFY

APP.LOKIFY est une V1 de SaaS de gestion et de reservation de materiel avec frontend Next.js, backend Express et base PostgreSQL.

## Structure

- `frontend/` : application Next.js pour l'interface SaaS.
- `backend/` : API REST Express pour l'authentification et la logique metier.
- `database/` : schema SQL et seed de demonstration compatibles PostgreSQL / Supabase.

## Lancement rapide

### Mode local immediat

1. Verifier `backend/.env` avec `DATABASE_MODE=memory`.
2. Verifier `frontend/.env.local`.
3. Installer les dependances dans `frontend/` et `backend/`.
4. Lancer l'API avec `npm.cmd run dev` dans `backend/`.
5. Lancer le frontend avec `npm.cmd run dev` dans `frontend/`.

### Mode PostgreSQL / Supabase

1. Passer `DATABASE_MODE=postgres` dans `backend/.env`.
2. Demarrer PostgreSQL localement, par exemple avec `docker compose up -d`.
3. Appliquer le schema SQL avec `database/migrations/001_init.sql`.
4. Charger les donnees de demonstration avec `database/seeds/seed.sql`.
5. Lancer l'API puis le frontend.

## Comptes de demonstration

- Super admin : `team@lokify.fr` / `admin`
- Prestataire demo : `presta@lokify.fr` / `presta`

