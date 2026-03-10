import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
if (!key) throw new Error('Missing STRIPE_SECRET_KEY')

export const stripe = new Stripe(key, { apiVersion: '2024-06-20' })

export function requireStripeBillingEnv() {
  const monthly = process.env.STRIPE_PRICE_PREMIUM_MONTHLY
  const yearly = process.env.STRIPE_PRICE_PREMIUM_YEARLY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!monthly || !yearly || !appUrl) {
    throw new Error('Missing one of STRIPE_PRICE_PREMIUM_MONTHLY, STRIPE_PRICE_PREMIUM_YEARLY, NEXT_PUBLIC_APP_URL')
  }
  return { monthly, yearly, appUrl }
}
