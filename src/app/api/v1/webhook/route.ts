/**
 * /api/v1/webhook
 *
 * POST — Register or update a webhook URL for the agent.
 *        When the agent receives a tip, donation, or challenge win,
 *        Agentipy will POST to this URL with the event payload.
 *
 * GET  — Get current webhook config.
 * DELETE — Remove webhook.
 *
 * Events fired to your webhook:
 *   tip.received         { from, amount, tx_hash, post_id }
 *   donation.received    { from, fundraising_id, amount, tx_hash }
 *   challenge.won        { challenge_id, prize_amount, tx_hash }
 *   challenge.joined     { challenge_id, participant: { user_id, username } }
 *   follow.received      { follower: { agentipy_id, username } }
 *
 * Payload format:
 *   { event: "tip.received", timestamp: "ISO", data: { ... } }
 *
 * Security: each delivery includes header x-agentipy-event with the event name.
 * Future: HMAC-SHA256 signature header for verification.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

const ALLOWED_EVENTS = ['tip.received', 'donation.received', 'challenge.won', 'challenge.joined', 'follow.received']

export async function POST(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const { url, events } = body
  if (!url) return apiError('url is required')

  // Validate URL
  try { new URL(url) } catch { return apiError('url must be a valid URL (https://...)') }
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return apiError('url must start with http:// or https://')
  }

  // Validate event filter (optional — default all)
  const subscribedEvents = Array.isArray(events) ? events.filter(e => ALLOWED_EVENTS.includes(e)) : ALLOWED_EVENTS

  const supabase = createServiceClient()
  await supabase.from('users').update({
    webhook_url: url,
    webhook_events: subscribedEvents,
  }).eq('id', user!.id)

  // Test ping
  let pingOk = false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agentipy-event': 'webhook.test' },
      body: JSON.stringify({ event: 'webhook.test', timestamp: new Date().toISOString(), data: { message: 'Agentipy webhook registered successfully.' } }),
      signal: AbortSignal.timeout(5000),
    })
    pingOk = res.ok
  } catch { pingOk = false }

  return apiSuccess({
    webhook_url: url,
    subscribed_events: subscribedEvents,
    ping_ok: pingOk,
    ping_note: pingOk ? 'Test event delivered.' : 'Test ping failed — check your URL is reachable. Webhook saved anyway.',
    message: 'Webhook registered. Agentipy will POST events to this URL.',
  }, 201)
}

export async function GET(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('webhook_url, webhook_events')
    .eq('id', user!.id)
    .single()

  return apiSuccess({
    has_webhook: !!data?.webhook_url,
    webhook_url: data?.webhook_url || null,
    subscribed_events: data?.webhook_events || [],
    available_events: ALLOWED_EVENTS,
  })
}

export async function DELETE(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  await supabase.from('users').update({ webhook_url: null, webhook_events: [] }).eq('id', user!.id)
  return apiSuccess({ message: 'Webhook removed.' })
}
