# Factory Alert — Backend Setup & Reference

Complete guide for the Node.js API, Super Admin panel, Company Admin panel, and Worker (mobile) endpoints.

---

## Project structure

```
factory-alert-backend/
├── backend/                 ← API server (this folder)
│   ├── src/
│   │   ├── index.ts         ← Express app entry
│   │   ├── db/schema.ts     ← SQL schema + in-memory store
│   │   ├── middleware/auth.ts
│   │   ├── routes/
│   │   │   ├── superAdmin.ts
│   │   │   ├── companyAdmin.ts
│   │   │   └── workers.ts
│   │   └── utils/evacuationFiles.ts
│   ├── uploads/             ← Evacuation plan file uploads
│   ├── .env
│   └── SETUPBACKEND.md      ← This file
├── super-admin/             ← Super Admin web panel (HTML)
└── company-admin/           ← Company Admin web panel (HTML)
```

The React Native mobile app lives in a separate repo folder: `factory-alert-mobile-app/`.

---

## Quick start

### 1. Install & configure

```bash
cd factory-alert-backend/backend
npm install
```

Edit `.env` in this folder (create it if missing):

```env
PORT=3000
MASTER_PASSWORD=your_super_secret_master_password

# Optional — for production push notifications
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Optional — for persistent database (not wired yet)
DATABASE_URL=postgresql://...
```

### 2. Run the server

```bash
npm run dev
```

You should see:

```
🚨 Factory Alert API running on http://localhost:3000
```

### 3. Open admin panels in browser

| Panel | URL |
|-------|-----|
| Super Admin | http://localhost:3000/panels/super-admin/ |
| Company Admin | http://localhost:3000/panels/company-admin/ |
| Health check | http://localhost:3000/health |

---

## What has been built

### Core platform

- **Express 5** API with session-based authentication and role-based access (`super_admin`, `company_admin`, `worker`)
- **In-memory database** for local development (`src/db/schema.ts`) — data resets when the server restarts
- **Supabase SQL schema** included in `schema.ts` (`SQL_SCHEMA` constant) for future production use
- **CORS** enabled for web panels and mobile app
- **Static file serving** for uploaded evacuation plans at `/uploads/evacuation-plans/{company_code}/`
- **Admin panels** served from `/panels/super-admin/` and `/panels/company-admin/`

---

## Super Admin

**Login:** `MASTER_PASSWORD` from `.env`  
**Panel:** http://localhost:3000/panels/super-admin/

### Features implemented

| Feature | Description |
|---------|-------------|
| Company onboarding | Create companies with building name, address, floors, admin password |
| Company code generation | Auto-generated readable code (e.g. `TOYOTAMO2026123`) |
| Company list & details | View all clients, worker counts, alert counts |
| Company edit | Update building details |
| Company deactivate | Soft-disable a company |
| **Evacuation plan (text)** | Set `evacuation_plan` instructions and `assembly_point` per company |
| **Evacuation plan (file upload)** | Upload PDF, TXT, Word, or images (max 10 MB) |
| **Evacuation plan delete** | Remove file only, or delete entire plan |
| Onboard evacuation plan | Can set plan text/assembly point when creating a company |

### Super Admin API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/super-admin/login` | Login with master password → session token |
| POST | `/super-admin/companies` | Create company |
| GET | `/super-admin/companies` | List all companies |
| GET | `/super-admin/companies/:company_code` | Full company details |
| PATCH | `/super-admin/companies/:company_code` | Update company fields |
| PUT | `/super-admin/companies/:company_code/evacuation-plan` | Save text plan + assembly point |
| POST | `/super-admin/companies/:company_code/evacuation-plan/upload` | Upload plan file (`plan_file` multipart) |
| DELETE | `/super-admin/companies/:company_code/evacuation-plan/file` | Remove uploaded file only |
| DELETE | `/super-admin/companies/:company_code/evacuation-plan` | Delete all evacuation plan data |
| PATCH | `/super-admin/companies/:company_code/deactivate` | Deactivate company |

**Evacuation plan permissions:** Only Super Admin can create, edit, upload, or delete evacuation plans. Company Admin and Workers have **read-only** access.

---

## Company Admin

**Login:** `company_code` + `admin_password` (set by Super Admin)  
**Panel:** http://localhost:3000/panels/company-admin/

### Features implemented

| Feature | Description |
|---------|-------------|
| Dashboard | Live stats, active alerts, recent activity |
| Workers list | View enrolled workers with **zone name** |
| Remove worker | Delete/deactivate a worker |
| Zones CRUD | Add/delete building zones (required before workers can join) |
| Alerts list | View all alerts with zone and trigger info |
| Resolve alert | Mark an alert as resolved |
| **Alert acknowledgments** | Per-alert modal: worker safe-exit status + admin confirm button |
| **Emergency contacts CRUD** | Add/edit/delete emergency dial numbers for mobile |
| Evacuation plan | **Read-only** view of plan set by Super Admin |
| Enroll banner | Prompts admin to add zones before workers register |

### Company Admin API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/company-admin/login` | Login with company code + password |
| GET | `/company-admin/dashboard` | Dashboard stats + live alerts |
| GET | `/company-admin/workers` | List workers (includes `zone_name`) |
| DELETE | `/company-admin/workers/:worker_id` | Remove worker |
| GET | `/company-admin/zones` | List zones |
| POST | `/company-admin/zones` | Add zone (name, floor, exit, extinguisher, etc.) |
| DELETE | `/company-admin/zones/:zone_id` | Delete zone |
| GET | `/company-admin/alerts` | All alerts |
| PATCH | `/company-admin/alerts/:alert_id/resolve` | Resolve alert |
| GET | `/company-admin/alerts/:alert_id/acknowledgments` | Worker ack status for an alert |
| POST | `/company-admin/alerts/:alert_id/acknowledge/:worker_id` | Admin confirms worker safe exit |
| GET | `/company-admin/evacuation-plan` | Read-only evacuation plan |
| POST/PATCH/PUT/DELETE | `/company-admin/evacuation-plan` | **403 Forbidden** — Super Admin only |
| GET | `/company-admin/emergency-contacts` | List emergency dial numbers |
| POST | `/company-admin/emergency-contacts` | Add contact (`label`, `phone`) |
| PATCH | `/company-admin/emergency-contacts/:contact_id` | Update contact |
| DELETE | `/company-admin/emergency-contacts/:contact_id` | Delete contact |

---

## Workers (Mobile App API)

All worker routes except `/workers/join` and `/workers/join/zones` require `Authorization: Bearer <token>`.

### Features implemented

| Feature | Description |
|---------|-------------|
| **Zone at registration** | Workers must pick a zone when joining (`zone_id` required) |
| Public zone list | `GET /workers/join/zones?company_code=` — no auth, for join screen |
| Re-registration | Same phone + company code updates name, position, zone |
| FCM token update | `PATCH /workers/fcm-token` for push notifications |
| Trigger alert | 5 alert types: fire, medical, evacuation, security, general |
| **Zone fallback on alert** | If no zone picked at trigger time, uses worker's registered zone |
| Push notifications | Firebase/Expo push to all enrolled workers (fallback: mobile polls) |
| **Triple-tap acknowledge** | Worker confirms safe exit → `POST /workers/alert/:id/acknowledge` |
| Acknowledgment records | Created for every active worker when alert fires |
| Evacuation plan (read-only) | Text, assembly point, file URL, emergency contacts |
| Alert history | Recent alerts with status |
| Resolve alert | Worker can mark alert resolved |

### Workers API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/workers/join/zones?company_code=` | No | Zones for registration picker |
| POST | `/workers/join` | No | Join factory (`company_code`, `phone`, `name`, `position`, `zone_id`) |
| PATCH | `/workers/fcm-token` | Yes | Update push token |
| GET | `/workers/zones` | Yes | Zones for alert confirmation screen |
| GET | `/workers/evacuation-plan` | Yes | Plan + emergency contacts |
| POST/PATCH/DELETE | `/workers/evacuation-plan` | Yes | **403 Forbidden** — read-only |
| POST | `/workers/alert` | Yes | Trigger alert (`alert_type`, optional `zone_id`) |
| POST | `/workers/alert/:alert_id/acknowledge` | Yes | Record worker safe-exit acknowledgment |
| POST | `/workers/alert/:alert_id/resolve` | Yes | Resolve alert |
| GET | `/workers/alerts` | Yes | Alert history |

### Join payload example

```json
{
  "company_code": "ACMEFACT2026847",
  "phone": "9876543210",
  "name": "Raj Kumar",
  "position": "Welder",
  "zone_id": "uuid-of-zone",
  "fcm_token": "optional-expo-push-token"
}
```

### Trigger alert payload example

```json
{
  "alert_type": "fire",
  "zone_id": "optional-override-zone-id"
}
```

If `zone_id` is omitted, the backend uses the worker's registered `zone_id` / `zone_name`.

---

## Database tables

Defined in `src/db/schema.ts`:

| Table | Purpose |
|-------|---------|
| `companies` | Client factories, codes, evacuation plan fields, file metadata |
| `zones` | Building areas (floor, exits, extinguishers) |
| `workers` | Mobile users with `zone_id`, `zone_name`, FCM token |
| `alerts` | Emergency alerts with type, zone, trigger info, status |
| `alert_acknowledgments` | Per-worker safe-exit + admin confirmation timestamps |
| `emergency_contacts` | Company-managed dial numbers for mobile |

**Note:** Currently uses in-memory arrays (`db.companies`, `db.workers`, etc.). Restarting the server clears all data.

---

## Evacuation plan file uploads

- **Upload route:** `POST /super-admin/companies/:code/evacuation-plan/upload`
- **Field name:** `plan_file` (multipart form)
- **Allowed types:** PDF, TXT, Word (.doc/.docx), PNG, JPEG, WebP
- **Max size:** 10 MB
- **Storage:** `backend/uploads/evacuation-plans/{company_code}/`
- **Public URL:** `http://localhost:3000/uploads/evacuation-plans/{company_code}/{filename}`
- **TXT files:** Content auto-read into `evacuation_plan` text field

Utility: `src/utils/evacuationFiles.ts`

---

## Push notifications

- Uses **Firebase Admin SDK** when configured in `.env`
- Sends to all active workers with an `fcm_token`
- **Without Firebase:** API still works; mobile app uses **3-second polling** on `GET /workers/alerts` as fallback

---

## Client onboarding flow

1. **Super Admin** creates company → gets `company_code` + sets `admin_password`
2. Give company head: code, password, panel URL (`/panels/company-admin/`)
3. **Company Admin** logs in → adds **zones** (Welding Bay, Floor 1, etc.)
4. **Super Admin** (optional) sets evacuation plan text/file + assembly point
5. **Company Admin** adds emergency dial numbers
6. **Workers** download mobile app → enter code, details, **select zone** → joined
7. Any worker can trigger alert → all workers notified → triple-tap acknowledge → admin verifies in panel

---

## Deploy to production (Railway example)

1. Push `factory-alert-backend` to GitHub
2. Create Railway project → deploy `backend` folder
3. Set environment variables (same as `.env`)
4. Note the public URL (e.g. `https://factory-alert.up.railway.app`)
5. Update `API` in both HTML panels and `API_BASE` in the mobile app

---

## Database (Supabase PostgreSQL)

All data is stored in Supabase when `DATABASE_URL` is set in `.env`.
Tables are created automatically on server start.

### Setup Supabase

1. Go to [https://supabase.com](https://supabase.com) → **New project**
2. Wait for the project to finish provisioning
3. Open **Project Settings** → **Database**
4. Copy the **Connection string** (URI format, mode: Session)
5. Paste into `backend/.env`:

```env
DATABASE_URL=postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

6. Replace `[YOUR-PASSWORD]` with your database password
7. Restart the backend: `npm run dev`

### Verify connection

Open `http://localhost:3000/health` — you should see:

```json
{ "status": "ok", "database": "connected" }
```

Without `DATABASE_URL`, the server falls back to in-memory storage (data lost on restart).

---

## Known limitations

- Workers registered before zone feature may need to re-join with a zone
- Firebase must be configured for native push in production
- Evacuation plan file uploads are stored on local disk (not Supabase storage yet)

---

## Useful commands

```bash
npm run dev      # Development (ts-node)
npm run build    # Compile TypeScript
npm start        # Run compiled dist/index.js
```
