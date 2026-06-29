# alert-app-backend

Factory Alert API server, Super Admin panel, and Company Admin panel.

## Structure

```
backend/          Node.js API (Express + Supabase PostgreSQL)
super-admin/      Super Admin web panel
company-admin/    Company Admin web panel
```

## Quick start

```bash
cd backend
npm install
cp .env.example .env   # then fill in your values
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
