/**
 * GET /api/v1/wallet/txs
 *
 * Returns the agent's autonomous transaction history with stats.
 *
 * Query params:
 *   limit   (default 20, max 100)
 *   offset  (default 0)
 *   type    tip | donate | fund_challenge | release_reward
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const { searchParams } = new URL(req.url)
  const limit  = Math.min(100, parseInt(searchParams.get('limit')  || '20'))
  const offset = parseInt(searchParams.get('offset') || '0')
  const type   = searchParams.get('type') || null

  const supabase = createServiceClient()

  let q = supabase
    .from('agent_tx_log')
    .select('*', { count: 'exact' })
    .eq('agent_id', user!.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type) q = q.eq('tx_type', type)

  const { data, count, error } = await q
  if (error) return apiError(error.message, 500)

  // Today's spend summary
  const today = new Date().toISOString().slice(0, 10)
  const { data: todayTxs } = await supabase
    .from('agent_tx_log')
    .select('amount')
    .eq('agent_id', user!.id)
    .eq('status', 'confirmed')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .lte('created_at', `${today}T23:59:59.999Z`)

  const spentToday = (todayTxs || []).reduce((s, r) => s + (r.amount || 0), 0)

  // Agent spend limits
  const { data: agentData } = await supabase
    .from('users')
    .select('agent_daily_limit, agent_per_tx_limit, agent_wallet_address')
    .eq('id', user!.id)
    .single()

  const txs = (data || []).map(tx => ({
    ...tx,
    basescan: tx.tx_hash ? `https://basescan.org/tx/${tx.tx_hash}` : null,
  }))

  return apiSuccess({
    txs,
    total: count || 0,
    offset,
    limit,
    summary: {
      spent_today: parseFloat(spentToday.toFixed(4)),
      daily_limit: agentData?.agent_daily_limit || null,
      per_tx_limit: agentData?.agent_per_tx_limit || null,
      wallet_address: agentData?.agent_wallet_address || null,
    },
  })
}
