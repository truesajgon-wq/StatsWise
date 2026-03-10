import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import { availablePaymentMethods, effectivePlan, isTrialEligible } from '@/lib/billing'

function fallbackCountryFromHeaders(acceptLanguage: string | null) {
  const val = String(acceptLanguage || '').toLowerCase()
  if (val.includes('pl')) return 'PL'
  return 'unknown'
}

export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const [{ data: profile }, { data: sub }, { count }] = await Promise.all([
    supabase.from('profiles').select('id,email,country,trial_used,stripe_customer_id').eq('id', user.id).maybeSingle(),
    supabase
      .from('subscriptions')
      .select('plan,status,cancel_at_period_end,current_period_end,trial_end,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing']),
  ])

  const activeExists = (count || 0) > 0
  const country = profile?.country || fallbackCountryFromHeaders((await headers()).get('accept-language'))
  const trialEligible = isTrialEligible(Boolean(profile?.trial_used), activeExists)
  const plan = effectivePlan((sub?.status as any) || 'none', (sub?.plan as any) || 'free')

  return NextResponse.json({
    plan,
    status: sub?.status || 'none',
    trialEligible,
    cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
    currentPeriodEnd: sub?.current_period_end || null,
    country,
    availablePaymentMethods: availablePaymentMethods(country),
  })
}
