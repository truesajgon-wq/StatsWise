# StatsWise

StatsWise is a Vite + React frontend with an Express backend for football data, Supabase authentication, and Stripe-backed subscription flows.

## Local development

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm test
npm start
```

Pre-deploy verification:

```bash
npm run verify
```

Frontend environment:

```env
VITE_API_BASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_USE_MOCK_DATA=false
```

Backend environment:

Copy `backend/.env.example` to `backend/.env` and fill in the real values.

## Deployment

Use [DEPLOYMENT.md](/Users/Anetka/Desktop/obstawiaj_final/DEPLOYMENT.md) for the production checklist, provider setup, environment variables, and the post-deploy verification flow.

## Notes

- Supabase auth is used for email registration, email confirmation, and password recovery.
- Billing endpoints require authenticated Supabase users.
- Mock billing is now treated as local-development-only and requires explicit `ALLOW_MOCK_BILLING=true`.
- Backend subscription state is stored in a JSON file by default; for production you should set `BILLING_STORE_PATH` to a persistent disk location.
- Backend startup now fails early if production billing configuration is incomplete.
