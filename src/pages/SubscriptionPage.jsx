import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { getPricing } from '../data/currency.js'
import {
  fetchBillingSubscription,
  createBillingCheckoutSession,
  cancelBillingSubscription,
  fetchBillingCheckoutStatus,
  startBillingTrial,
} from '../data/api.js'
import { formatAppDate } from '../utils/dateFormat.js'
import StatsWiseWordmark from '../components/StatsWiseWordmark.jsx'

const PLAN_KEYS = {
  FREE: 'free',
  MONTHLY: 'premium_monthly',
  YEARLY: 'premium_yearly',
}

const COUNTRY_OPTIONS = [
  'Poland',
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Other',
]


function planLabel(key) {
  if (key === PLAN_KEYS.MONTHLY) return 'Premium Monthly'
  if (key === PLAN_KEYS.YEARLY) return 'Premium Yearly'
  return 'Free'
}

function PlanCard({ plan, selected, currentPlan, onSelect }) {
  const isCurrent = currentPlan === plan.key
  const cta = plan.key === PLAN_KEYS.FREE
    ? 'Continue with Free'
    : 'Subscribe'

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? 'rgba(255, 122, 44, 0.12)' : 'var(--sw-panel-gradient)',
        border: `2px solid ${isCurrent ? '#22c55e' : selected ? 'var(--sw-accent)' : 'var(--sw-border)'}`,
        borderRadius: 14,
        padding: 16,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {isCurrent && (
        <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 999, padding: '2px 8px', fontWeight: 800 }}>
          ACTIVE
        </span>
      )}
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sw-text)', marginBottom: 8 }}>{plan.name}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>{plan.price}</div>
      <div style={{ fontSize: 12, color: 'var(--sw-muted)', marginBottom: 10 }}>{plan.note}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
        {plan.benefits.map(item => (
          <div key={item} style={{ fontSize: 12, color: '#cbd5e1' }}>- {item}</div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#e5e7eb', fontWeight: 700 }}>{cta}</div>
    </button>
  )
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()

  const [selectedPlan, setSelectedPlan] = useState(PLAN_KEYS.FREE)
  const [billing, setBilling] = useState(null)
  const [countryOverride, setCountryOverride] = useState('')
  const [paymentMethod] = useState('stripe_card')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const handledSession = useRef(false)

  const browserLocale = (navigator?.language || 'en-US').toLowerCase()
  const inferredCountryFromLocale = browserLocale.includes('pl') ? 'Poland' : browserLocale.includes('en-us') ? 'United States' : browserLocale.includes('en-gb') ? 'United Kingdom' : 'Other'
  const effectiveCountry = countryOverride || billing?.country || user?.country || inferredCountryFromLocale
  const pricing = useMemo(() => getPricing(effectiveCountry), [effectiveCountry])

  const plans = useMemo(() => ([
    {
      key: PLAN_KEYS.FREE,
      name: 'Free',
      price: `0${pricing.symbol}`,
      note: 'No billing',
      benefits: ['Full app access enabled', 'No billing', 'Use every current feature for free'],
    },
    {
      key: PLAN_KEYS.MONTHLY,
      name: 'Premium Monthly',
      price: pricing.monthlyFmt,
      note: 'Billed monthly',
      benefits: ['Reserved for future premium rollout', 'Monthly billing', 'Configuration kept for launch readiness'],
    },
    {
      key: PLAN_KEYS.YEARLY,
      name: 'Premium Yearly',
      price: pricing.yearlyFmt,
      note: `${pricing.yearlyMonthlyFmt}/month billed yearly`,
      benefits: ['Reserved for future premium rollout', 'Yearly billing', pricing.savingsFmt ? `Save ${pricing.savingsFmt} yearly` : 'Best value'],
    },
  ]), [pricing])

  async function loadBilling() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchBillingSubscription({
        country: countryOverride || user?.country,
        locale: browserLocale,
      })
      setBilling(data)
    } catch (e) {
      setError(e.message || 'Failed to load billing state')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBilling()
  }, [user?.id, user?.email, countryOverride])

  useEffect(() => {
    const payment = searchParams.get('payment')
    const sessionId = searchParams.get('session_id')
    if (payment !== 'success' || !sessionId || handledSession.current) return
    handledSession.current = true
    ;(async () => {
      try {
        const status = await fetchBillingCheckoutStatus(sessionId)
        if (!status.paid) throw new Error('Payment not completed yet.')
        setSuccess('Payment confirmed. Subscription state updated.')
        await loadBilling()
      } catch (e) {
        setError(e.message || 'Could not verify checkout session')
      } finally {
        const next = new URLSearchParams(searchParams)
        next.delete('payment')
        next.delete('session_id')
        setSearchParams(next, { replace: true })
      }
    })()
  }, [searchParams, setSearchParams])

  const currentPlan = billing?.plan || PLAN_KEYS.FREE
  const selectedPlanData = plans.find(p => p.key === selectedPlan)
  const showCheckoutPanel = selectedPlan !== PLAN_KEYS.FREE

  async function handleCheckout() {
    setError('')
    setLoading(true)
    try {
      const session = await createBillingCheckoutSession({
        plan: selectedPlan,
        country: effectiveCountry,
        locale: browserLocale,
        paymentMethod,
      })
      if (!session?.url) throw new Error('Checkout URL missing.')
      window.location.assign(session.url)
    } catch (e) {
      setError(e.message || 'Could not start checkout')
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel at period end? You will keep access until the current period ends.')) return
    setLoading(true)
    setError('')
    try {
      await cancelBillingSubscription()
      setSuccess('Cancellation scheduled. Access remains active until current period end.')
      await loadBilling()
    } catch (e) {
      setError(e.message || 'Cancel failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleStartTrial() {
    setError('')
    setLoading(true)
    try {
      await startBillingTrial()
      setSuccess('Your 7-day free trial has started. Enjoy full premium access!')
      await loadBilling()
    } catch (e) {
      setError(e.message || 'Could not start trial')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="theme-page" style={{ color: 'var(--sw-text)' }}>
      <header className="theme-header subscription-page-header" style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--sw-border)',
              background: 'rgba(255,255,255,0.03)',
              color: '#cbd5e1',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Go to home page"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'center' }}
        >
          <StatsWiseWordmark color="#d1d5db" />
        </button>
        <div style={{ justifySelf: 'end' }} />
      </header>

      <div className="subscription-page-content" style={{ maxWidth: 1040, margin: '0 auto', padding: 22 }}>
        {success && <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>{success}</div>}
        {error && <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{error}</div>}

        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--sw-muted)' }}>Country</div>
          <select className="theme-select" value={effectiveCountry} onChange={e => setCountryOverride(e.target.value)} style={{ padding: '6px 10px' }}>
            {COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Trial banner */}
        {billing?.trial?.active && (
          <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,122,44,0.08)', border: '1px solid rgba(255,122,44,0.35)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sw-accent)' }}>Free trial active</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
                {billing.trial.daysLeft === 1 ? '1 day' : `${billing.trial.daysLeft} days`} remaining
                {billing.trial.endsAt ? ` — ends ${formatAppDate(billing.trial.endsAt)}` : ''}
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--sw-accent)', lineHeight: 1 }}>
              {billing.trial.daysLeft}d
            </div>
          </div>
        )}

        {/* Start trial CTA — shown only if no trial used and no active subscription */}
        {!billing?.trial?.used && currentPlan === PLAN_KEYS.FREE && (
          <div style={{ marginBottom: 14, padding: '14px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e', marginBottom: 4 }}>Start your 7-day free trial</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 10 }}>Get full premium access for 7 days, no payment required. One trial per account.</div>
            <button
              onClick={handleStartTrial}
              disabled={loading}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#0f172a', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
            >
              Start free trial
            </button>
          </div>
        )}

        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--sw-muted)' }}>
          Current: <span style={{ color: 'var(--sw-text)', fontWeight: 700 }}>{planLabel(currentPlan)}</span>
          {billing?.subscription?.status && billing.subscription.status !== 'inactive' && (
            <span style={{ marginLeft: 10, color: '#e5e7eb' }}>
              {billing.subscription.status}
              {billing.subscription.current_period_end ? ` - ends ${formatAppDate(billing.subscription.current_period_end)}` : ''}
            </span>
          )}
        </div>

        <div className="subscription-plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 16 }}>
          {plans.map(plan => (
            <PlanCard
              key={plan.key}
              plan={plan}
              selected={selectedPlan === plan.key}
              currentPlan={currentPlan}
              onSelect={() => setSelectedPlan(plan.key)}
            />
          ))}
        </div>

        {currentPlan !== PLAN_KEYS.FREE && (
          <div style={{ marginBottom: 14 }}>
            <button onClick={handleCancel} disabled={loading} style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
              Cancel subscription
            </button>
          </div>
        )}

        {showCheckoutPanel && selectedPlanData && (
          <div className="theme-card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Checkout summary</div>
            <div style={{ fontSize: 13, color: 'var(--sw-muted)', marginBottom: 8 }}>
              Plan: <span style={{ color: 'var(--sw-text)' }}>{selectedPlanData.name}</span> - {selectedPlanData.price}
            </div>
            <div style={{ fontSize: 13, color: 'var(--sw-muted)', marginBottom: 8 }}>
              Premium plans are preserved for later rollout. The current app remains fully accessible on Free.
            </div>
            <div style={{ fontSize: 13, color: 'var(--sw-muted)', marginBottom: 12 }}>
              Renews automatically unless canceled. Cancel anytime.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
                <rect x="0.5" y="0.5" width="21" height="15" rx="2.5" stroke="#94a3b8"/>
                <rect x="0" y="4" width="22" height="3" fill="#94a3b8" opacity="0.4"/>
                <rect x="2.5" y="10" width="5" height="2" rx="1" fill="#94a3b8"/>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--sw-muted)' }}>Credit / Debit card</span>
            </div>

            <div className="subscription-checkout-actions" style={{ display: 'flex', gap: 8 }}>
              <button className="theme-button-ghost" onClick={() => setSelectedPlan(PLAN_KEYS.FREE)} style={{ flex: 1, borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
                Continue with Free
              </button>
              <button className="theme-button-primary" onClick={handleCheckout} disabled={loading} style={{ flex: 2, borderRadius: 8, padding: '10px 12px', fontWeight: 800, cursor: 'pointer' }}>
                Subscribe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

