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

## Preview / preproduction Vercel

- Frontend Vercel : projet `app-lokify-fr`
- Backend Vercel : projet `app-lokify-fr-backend`
- Les domaines `app.lokify.fr` et `api.app.lokify.fr` restent la reference actuelle. Pour une preproduction non definitive, privilegier les URLs preview Vercel.
- Script utile : `powershell -ExecutionPolicy Bypass -File .\scripts\deploy-preview.ps1`
- Le script deploie d'abord le backend preview, puis le frontend preview branche sur cette API.
- Le backend accepte aussi les origins preview Vercel si `ALLOW_VERCEL_PREVIEW_ORIGINS=true`.

## Comptes de demonstration

- Super admin : `team@lokify.fr` / `admin`
- Prestataire demo : `presta@lokify.fr` / `presta`

