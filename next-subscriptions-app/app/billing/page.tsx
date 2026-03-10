'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type BillingPayload = {
  plan: 'free' | 'premium_monthly' | 'premium_yearly'
  status: 'none' | 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete'
  trialEligible: boolean
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  country: string
  availablePaymentMethods: {
    stripe: boolean
    applePay: boolean
    googlePay: boolean
    p24: boolean
    blik: boolean
  }
}

export default function BillingPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'premium_monthly' | 'premium_yearly'>('free')
  const [state, setState] = useState<BillingPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const res = await fetch('/api/billing/subscription', { cache: 'no-store' })
    if (res.status === 401) {
      router.push('/login')
      return
    }
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to load billing state')
      return
    }
    setState(data)
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (params.get('success') === '1') refresh()
  }, [params])

  async function startCheckout() {
    if (selectedPlan === 'free') return
    setLoading(true)
    setError('')
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: selectedPlan }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error || 'Could not start checkout')
      return
    }
    window.location.href = data.url
  }

  async function cancelSub() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/billing/cancel', { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error || 'Cancellation failed')
      return
    }
    await refresh()
  }

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const cta = selectedPlan === 'free'
    ? 'Continue with Free'
    : state?.trialEligible
      ? 'Start free trial'
      : 'Subscribe'

  return (
    <main style={{ maxWidth: 980, margin: '24px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Subscription</h1>
        <button onClick={logout}>Logout</button>
      </div>
      {error && <div style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</div>}
      {params.get('success') === '1' && <div style={{ color: '#4ade80', marginBottom: 12 }}>Checkout completed. Waiting for webhook sync.</div>}
      {params.get('canceled') === '1' && <div style={{ color: '#fbbf24', marginBottom: 12 }}>Checkout canceled.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
        {[
          { key: 'free' as const, title: 'Free', price: '0' },
          { key: 'premium_monthly' as const, title: 'Premium Monthly', price: 'Stripe monthly price' },
          { key: 'premium_yearly' as const, title: 'Premium Yearly', price: 'Stripe yearly price' },
        ].map(plan => (
          <label key={plan.key} style={{ border: `2px solid ${selectedPlan === plan.key ? '#3b82f6' : '#334155'}`, borderRadius: 12, padding: 12, position: 'relative', cursor: 'pointer' }}>
            {plan.key !== 'free' && state?.trialEligible && (
              <span style={{ position: 'absolute', top: -10, left: 10, background: '#f59e0b', color: '#111827', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                7-day free trial
              </span>
            )}
            <input type="radio" name="plan" checked={selectedPlan === plan.key} onChange={() => setSelectedPlan(plan.key)} />
            <div style={{ fontWeight: 700, marginTop: 8 }}>{plan.title}</div>
            <div>{plan.price}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Cancel anytime</div>
          </label>
        ))}
      </div>

      {state && (
        <section style={{ marginTop: 16, border: '1px solid #334155', borderRadius: 12, padding: 12 }}>
          <div>Current plan: <strong>{state.plan}</strong> ({state.status})</div>
          {state.cancelAtPeriodEnd && state.currentPeriodEnd && (
            <div style={{ color: '#fbbf24', marginTop: 6 }}>
              Active until {new Date(state.currentPeriodEnd).toLocaleString()}
            </div>
          )}
          <div style={{ marginTop: 8 }}>Payment methods available ({state.country}):</div>
          <ul>
            <li>Stripe: {state.availablePaymentMethods.stripe ? 'Yes' : 'No'}</li>
            <li>Apple Pay: {state.availablePaymentMethods.applePay ? 'Yes' : 'No'}</li>
            <li>Google Pay: {state.availablePaymentMethods.googlePay ? 'Yes' : 'No'}</li>
            <li>P24: {state.availablePaymentMethods.p24 ? 'Yes' : 'No'}</li>
            <li>BLIK: {state.availablePaymentMethods.blik ? 'Yes' : 'No'}</li>
          </ul>
        </section>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button disabled={loading || selectedPlan === 'free'} onClick={startCheckout}>{cta}</button>
        {state && (state.status === 'active' || state.status === 'trialing') && (
          <button disabled={loading} onClick={cancelSub}>Cancel subscription</button>
        )}
      </div>
    </main>
  )
}
