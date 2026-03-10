import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import { checkoutPaymentTypes, isTrialEligible, normalizePlan } from '@/lib/billing'
import { requireStripeBillingEnv, stripe } from '@/lib/stripe'

function countryFallback(h: string | null) {
  const v = String(h || '').toLowerCase()
  if (v.includes('pl')) return 'PL'
  return 'unknown'
}

export async function POST(req: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const plan = normalizePlan(String(body?.plan || 'free'))
  if (plan === 'free') return NextResponse.json({ error: 'Select a premium plan.' }, { status: 400 })

  const { monthly, yearly, appUrl } = requireStripeBillingEnv()
  const priceId = plan === 'premium_monthly' ? monthly : yearly

  const supabase = createAdminClient()
  const [{ data: profile }, { count: activeCount }] = await Promise.all([
    supabase.from('profiles').select('id,email,country,stripe_customer_id,trial_used').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['active', 'trialing']),
  ])

  const country = profile?.country || countryFallback((await headers()).get('accept-language'))
  const trialEligible = isTrialEligible(Boolean(profile?.trial_used), (activeCount || 0) > 0)

  let stripeCustomerId = profile?.stripe_customer_id || null
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    })
    stripeCustomerId = customer.id
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      stripe_customer_id: stripeCustomerId,
      country: profile?.country || null,
      trial_used: Boolean(profile?.trial_used),
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    payment_method_types: checkoutPaymentTypes(country),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
    subscription_data: {
      ...(trialEligible ? { trial_period_days: 7 } : {}),
      metadata: {
        user_id: user.id,
        plan,
      },
    },
    metadata: {
      user_id: user.id,
      plan,
    },
  })

  return NextResponse.json({ url: session.url })
}
