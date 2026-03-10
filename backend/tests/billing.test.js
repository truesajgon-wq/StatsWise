import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BILLING_PLANS,
  normalizePlan,
  inferCountry,
  paymentMethodsForCountry,
  applyCancelAtPeriodEnd,
} from '../billingUtils.js'

test('country-specific payment methods selection', () => {
  assert.deepEqual(paymentMethodsForCountry('Poland'), ['stripe_card', 'apple_pay', 'google_pay', 'p24', 'blik'])
  assert.deepEqual(paymentMethodsForCountry('United States'), ['stripe_card', 'apple_pay', 'google_pay'])
})

test('cancellation flow marks cancel at period end', () => {
  const updated = applyCancelAtPeriodEnd({
    status: 'active',
    cancel_at_period_end: false,
  }, '2026-02-27T12:00:00.000Z')
  assert.equal(updated.status, 'canceled')
  assert.equal(updated.cancel_at_period_end, true)
  assert.equal(updated.canceled_at, '2026-02-27T12:00:00.000Z')
})

test('plan/country normalization helpers', () => {
  assert.equal(normalizePlan('monthly'), BILLING_PLANS.PREMIUM_MONTHLY)
  assert.equal(normalizePlan('premium_yearly'), BILLING_PLANS.PREMIUM_YEARLY)
  assert.equal(normalizePlan('whatever'), BILLING_PLANS.FREE)
  assert.equal(inferCountry({ explicitCountry: 'Poland' }), 'Poland')
  assert.equal(inferCountry({ locale: 'pl-PL' }), 'Poland')
})
