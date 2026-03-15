export const BILLING_PLANS = {
  FREE: 'free',
  PREMIUM_MONTHLY: 'premium_monthly',
  PREMIUM_YEARLY: 'premium_yearly',
}

export function normalizePlan(plan) {
  const raw = String(plan || '').toLowerCase()
  if (raw === 'premium_yearly' || raw === 'yearly') return BILLING_PLANS.PREMIUM_YEARLY
  if (raw === 'premium_monthly' || raw === 'monthly') return BILLING_PLANS.PREMIUM_MONTHLY
  return BILLING_PLANS.FREE
}

export function inferCountry({ explicitCountry, profileCountry, locale } = {}) {
  if (explicitCountry) return explicitCountry
  if (profileCountry) return profileCountry
  const l = String(locale || '').toLowerCase()
  if (l.includes('pl')) return 'Poland'
  if (l.includes('en-us')) return 'United States'
  if (l.includes('en-gb')) return 'United Kingdom'
  return 'Other'
}

export function paymentMethodsForCountry(country) {
  const isPoland = country === 'Poland' || country === 'Polska' || country === 'PL'
  return ['stripe_card']

}

export function accessPlanFromSubscription(sub, now = Date.now()) {
  if (!sub) return BILLING_PLANS.FREE
  const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null
  const stillValid = currentPeriodEnd ? currentPeriodEnd > now : false
  if ((sub.status === 'active' || sub.status === 'canceled') && stillValid) {
    return normalizePlan(sub.plan)
  }
  return BILLING_PLANS.FREE
}

export function trialStatus(trial, now = Date.now()) {
  if (!trial) return { used: false, active: false, daysLeft: 0, endsAt: null }
  const endsAt = trial.ends_at ? new Date(trial.ends_at).getTime() : null
  const active = endsAt ? endsAt > now : false
  const daysLeft = active ? Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)) : 0
  return { used: Boolean(trial.used), active, daysLeft, endsAt: trial.ends_at || null }
}

export function accessPlanFromRecord(record, now = Date.now()) {
  const subPlan = accessPlanFromSubscription(record?.subscription, now)
  if (subPlan !== BILLING_PLANS.FREE) return subPlan
  const trial = trialStatus(record?.trial, now)
  if (trial.active) return BILLING_PLANS.PREMIUM_MONTHLY
  return BILLING_PLANS.FREE
}

export function applyCancelAtPeriodEnd(subscription, nowIso = new Date().toISOString()) {
  if (!subscription) return subscription
  return {
    ...subscription,
    status: 'canceled',
    cancel_at_period_end: true,
    canceled_at: nowIso,
  }
}
