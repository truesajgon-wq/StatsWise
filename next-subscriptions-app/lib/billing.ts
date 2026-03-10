export type Plan = 'free' | 'premium_monthly' | 'premium_yearly'
export type SubStatus = 'none' | 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete'

export function normalizePlan(plan: string): Plan {
  if (plan === 'premium_monthly') return 'premium_monthly'
  if (plan === 'premium_yearly') return 'premium_yearly'
  return 'free'
}

export function effectivePlan(status: SubStatus | null | undefined, plan: Plan | null | undefined): Plan {
  if ((status === 'active' || status === 'trialing') && plan) return plan
  return 'free'
}

export function isTrialEligible(trialUsed: boolean, hasActiveOrTrialing: boolean) {
  return !trialUsed && !hasActiveOrTrialing
}

export function availablePaymentMethods(country: string) {
  const isPL = country === 'PL'
  return {
    stripe: true,
    applePay: true,
    googlePay: true,
    p24: isPL,
    blik: isPL,
  }
}

export function checkoutPaymentTypes(country: string): ('card' | 'p24' | 'blik')[] {
  return country === 'PL' ? ['card', 'p24', 'blik'] : ['card']
}

export function statusFromStripe(status: string): SubStatus {
  if (status === 'trialing') return 'trialing'
  if (status === 'active') return 'active'
  if (status === 'canceled') return 'canceled'
  if (status === 'past_due') return 'past_due'
  if (status === 'incomplete') return 'incomplete'
  return 'none'
}

export function planFromPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return 'free'
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_MONTHLY) return 'premium_monthly'
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_YEARLY) return 'premium_yearly'
  return 'free'
}
