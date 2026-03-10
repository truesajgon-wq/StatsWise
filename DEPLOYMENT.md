# Deployment Runbook

This runbook covers the required steps to deploy StatsWise with:

- frontend hosting
- backend hosting
- Supabase auth
- Stripe subscriptions
- persistent billing state

## 1. Choose production URLs

Define these before configuring anything else:

- `APP_URL`: public frontend URL, for example `https://statswise.app`
- `API_URL`: public backend URL, for example `https://api.statswise.app`

## 2. Supabase setup

In Supabase:

1. Open Authentication -> URL Configuration.
2. Set `Site URL` to your production frontend URL.
3. Add redirect URLs:
   - `https://your-frontend-domain/login`
   - `https://your-frontend-domain/login?mode=reset`
4. Open Authentication -> Providers -> Email.
5. Enable email signup and email confirmations if you want confirmed-only access.
6. Configure SMTP if you want branded production emails instead of the default sender.

Required values you will copy into app config:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`

## 3. Stripe setup

In Stripe:

1. Create the monthly price.
2. Create the yearly price.
3. Copy both price IDs.
4. Create a webhook endpoint pointing to:
   - `https://your-backend-domain/api/billing/webhook/stripe`
5. Subscribe the webhook to at least:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
6. Copy the webhook signing secret.

Required values:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PREMIUM_MONTHLY`
- `STRIPE_PRICE_PREMIUM_YEARLY`

## 4. Persistent billing storage

The backend stores subscription/session state in a JSON file.

For production:

1. Provision persistent disk or durable mounted storage on the backend host.
2. Set `BILLING_STORE_PATH` to that persistent location.
3. Keep `ALLOW_MOCK_BILLING=false`.

Example:

```env
BILLING_STORE_PATH=/var/lib/statswise/billing-store.json
ALLOW_MOCK_BILLING=false
```

If you deploy to an environment with ephemeral filesystem only, move this store to a database before launch.

## 5. Backend environment

Create `backend/.env` with real production values:

```env
API_FOOTBALL_KEY=...
BACKEND_DATA_MODE=db
DATABASE_URL=...
PGSSLMODE=require
PORT=3001
HOST=0.0.0.0
FRONTEND_URL=https://your-frontend-domain
SUPABASE_URL=https://your-project-ref.supabase.co

ODDS_PROVIDER=theoddsapi
ODDS_API_KEY=...
ODDS_API_BASE_URL=
ODDS_SPORT_KEY=soccer
ODDS_BOOKMAKERS=bet365,superbet

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PREMIUM_MONTHLY=price_...
STRIPE_PRICE_PREMIUM_YEARLY=price_...

ALLOW_MOCK_BILLING=false
BILLING_STORE_PATH=/persistent/path/billing-store.json
```

## 6. Frontend environment

Create the frontend environment with:

```env
VITE_API_BASE_URL=https://your-backend-domain
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_USE_MOCK_DATA=false
```

## 7. Build and deploy

Frontend:

```bash
npm install
npm run build
```

Backend:

```bash
cd backend
npm install
npm test
npm start
```

Combined verification from the repo root:

```bash
npm run verify
```

Recommended deployment behavior:

- serve the frontend over HTTPS
- serve the backend over HTTPS
- ensure backend can reach PostgreSQL, Supabase JWKS, Stripe, and third-party data APIs
- expose `/api/health` for uptime checks

## 8. Post-deploy verification

Run this exact sequence on production:

1. Create a new account through email signup.
2. Confirm the account from the email.
3. Sign in successfully.
4. Trigger password recovery.
5. Complete password reset using the email link.
6. Open the subscription page while authenticated.
7. Start a test subscription checkout.
8. Complete checkout in Stripe.
9. Confirm the frontend shows the updated subscription state.
10. Cancel the subscription and confirm period-end cancellation is reflected.
11. Sign out and sign back in to confirm entitlement persists.

## 9. Launch gate

Do not treat the app as ready for public launch until all of these are true:

- frontend production build passes
- backend tests pass
- Supabase redirect URLs are configured correctly
- Stripe webhook is delivering successfully
- billing store is on persistent storage
- production env vars are set on both services
- manual auth and billing rehearsal succeeds end to end
