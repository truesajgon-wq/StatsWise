import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth'
import { stripe } from '@/lib/stripe'

export async function POST() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id,status,current_period_end')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub?.stripe_subscription_id) return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })

  const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  })

  await supabase
    .from('subscriptions')
    .update({
      cancel_at_period_end: Boolean(updated.cancel_at_period_end),
      current_period_end: updated.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null,
      status: updated.status,
    })
    .eq('stripe_subscription_id', sub.stripe_subscription_id)

  return NextResponse.json({ ok: true })
}
