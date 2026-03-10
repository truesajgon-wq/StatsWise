import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { planFromPriceId, statusFromStripe } from '@/lib/billing'
import { stripe } from '@/lib/stripe'

function hasTrialEnd(sub: Stripe.Subscription) {
  return Boolean(sub.trial_end && sub.trial_end > 0)
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = (await headers()).get('stripe-signature')
  if (!webhookSecret || !signature) return NextResponse.json({ error: 'Missing webhook config' }, { status: 400 })

  const payload = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (e: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${e.message}` }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('stripe_webhook_events').select('id').eq('id', event.id).maybeSingle()
  if (existing?.id) return NextResponse.json({ received: true, idempotent: true })
  await supabase.from('stripe_webhook_events').insert({ id: event.id })

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.user_id || session.subscription_details?.metadata?.user_id
    const country = session.customer_details?.address?.country || null
    if (userId && country) {
      const { data: profile } = await supabase.from('profiles').select('country').eq('id', userId).maybeSingle()
      if (!profile?.country) {
        await supabase.from('profiles').update({ country }).eq('id', userId)
      }
    }
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription
    const priceId = sub.items.data[0]?.price?.id || null
    const plan = planFromPriceId(priceId)
    const status = statusFromStripe(sub.status)
    const userIdFromMetadata = sub.metadata?.user_id || null
    const customerId = typeof sub.customer === 'string' ? sub.customer : null

    let userId = userIdFromMetadata
    if (!userId && customerId) {
      const { data: mapped } = await supabase.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      userId = mapped?.id || null
    }

    if (userId) {
      const upsertPayload = {
        user_id: userId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        plan,
        status,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      }
      await supabase.from('subscriptions').upsert(upsertPayload, { onConflict: 'stripe_subscription_id' })

      if (customerId) {
        await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId)
      }
      if (hasTrialEnd(sub)) {
        const { data: profile } = await supabase.from('profiles').select('trial_used').eq('id', userId).maybeSingle()
        if (!profile?.trial_used) {
          await supabase.from('profiles').update({ trial_used: true }).eq('id', userId)
        }
      }
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : null
    if (stripeSubId) {
      await supabase.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', stripeSubId)
    }
  }

  return NextResponse.json({ received: true })
}
