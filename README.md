# factory-alert-backend

Factory Alert API server, Super Admin panel, and Company Admin panel.

## Structure

```
backend/                    Node.js API (Express + Supabase PostgreSQL)
backend/panels/super-admin/ Super Admin web panel
backend/panels/company-admin/ Company Admin web panel
package.json                Root scripts for Railway deploy
```

## Quick start

```bash
cd backend
npm install
# create backend/.env with your values (see below)
npm run dev
```

See `backend/SETUPBACKEND.md` for full setup, API reference, and production deployment.

## Environment variables

Create `backend/.env` locally (never commit this file):

- `PORT`
- `MASTER_PASSWORD`
- `DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
