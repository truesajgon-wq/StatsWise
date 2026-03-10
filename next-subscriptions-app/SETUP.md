# Supabase + Stripe Subscription Setup (Next.js App Router)

This project implements:
- Supabase Auth (email magic link) + Postgres tables
- Stripe Checkout subscriptions + webhooks
- Plans: Free, Premium Monthly, Premium Yearly
- Free selected by default in UI
- One-time 7-day premium trial (server enforced)
- Cancel anytime at period end
- Country-aware methods (PL: card+p24+blik, else card)

## 1) Supabase Dashboard (click-by-click)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) and create/open your project.
2. In `Project Settings` -> `API`:
   - Copy `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public key` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role secret` -> `SUPABASE_SERVICE_ROLE_KEY` (server only)
3. In `Authentication` -> `Providers`:
   - Enable `Email`
   - Use `Magic Link` (recommended default)
4. In `Authentication` -> `URL Configuration`:
   - Add local redirect URL: `http://localhost:3000/billing`
5. In `SQL Editor`:
   - Open file `supabase-schema.sql`
   - Run it fully.

## 2) Stripe Dashboard (click-by-click)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/).
2. Create Product: `Premium`.
3. Create 2 recurring Prices:
   - Monthly recurring
   - Yearly recurring
4. Copy price IDs:
   - Monthly -> `STRIPE_PRICE_PREMIUM_MONTHLY`
   - Yearly -> `STRIPE_PRICE_PREMIUM_YEARLY`
5. In `Settings` -> `Payment methods`, enable:
   - Cards
   - Apple Pay
   - Google Pay
   - Przelewy24
   - BLIK
6. Copy secret key (`sk_test_...`) -> `STRIPE_SECRET_KEY`.

## 3) Environment variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Set:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PREMIUM_MONTHLY=price_...
STRIPE_PRICE_PREMIUM_YEARLY=price_...
```

## 4) Terminal commands

```bash
npm install
npm run dev
```

## 5) Stripe CLI webhook forwarding

1. Login:
```bash
stripe login
```
2. Forward events to local webhook:
```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```
3. Stripe CLI prints a `whsec_...` value.
4. Put it into `.env.local` as `STRIPE_WEBHOOK_SECRET`.
5. Restart Next.js server after updating env.

## 6) Implemented server routes

- `GET /api/billing/subscription`
- `POST /api/billing/checkout`
- `POST /api/billing/cancel`
- `POST /api/billing/webhook`

## 7) Product rule behavior

- UI always defaults selected radio to **Free**.
- Trial eligibility is computed server-side only:
  - `profiles.trial_used = false`
  - and no existing active/trialing subscription.
- Checkout sets Stripe trial (`trial_period_days=7`) only if eligible.
- Cancel endpoint sets `cancel_at_period_end=true` in Stripe.
- Country logic:
  - prefer `profiles.country`
  - webhook captures checkout billing country if profile.country is empty
  - fallback from request locale.
- Payment methods:
  - country `PL` -> `['card','p24','blik']`
  - otherwise -> `['card']`
- Webhook keeps Supabase subscription state synced and idempotent (`stripe_webhook_events` table).

## 8) Manual test checklist

1. **New user trial**
   - Login as fresh user.
   - Open `/billing`.
   - Premium cards show `7-day free trial`.
   - Start checkout on premium.
   - After webhook, `subscriptions.status=trialing` and `profiles.trial_used=true`.
2. **Existing user trial used**
   - Set `profiles.trial_used=true` in DB.
   - Refresh `/billing`.
   - No trial badge and premium CTA shows `Subscribe`.
3. **Country PL payment methods**
   - Set `profiles.country='PL'`.
   - `/api/billing/subscription` returns p24/blik=true.
   - Checkout session uses `payment_method_types` containing `p24` and `blik`.
4. **Non-PL methods**
   - Set `profiles.country='US'`.
   - p24/blik are false; checkout `payment_method_types=['card']`.
5. **Cancel flow**
   - Active/trialing subscription.
   - Click `Cancel subscription`.
   - Stripe sub `cancel_at_period_end=true`.
   - UI shows active-until date.
6. **Webhook sync/idempotency**
   - Re-send same Stripe event.
   - Ensure no duplicate side effects (`stripe_webhook_events` prevents repeats).
