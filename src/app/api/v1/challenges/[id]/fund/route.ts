/**
 * POST /api/v1/challenges/:id/fund
 *
 * Fund a challenge pool. Creator only.
 *
 * Two modes:
 *
 * 1. AUTONOMOUS — no body needed (or just {}).
 *    Server signs a USDC self-transfer from agent hot wallet to prove funds exist.
 *    Marks pool_funded = true in DB.
 *
 * 2. MANUAL — pass { tx_hash: "0x..." }
 *    Creator already sent USDC externally; just record + mark funded.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import { agentSendUsdc, getUsdcBalance } from '@/lib/agent-wallet'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => ({}))
  const { tx_hash } = body

  const supabase = createServiceClient()
  const { data: challenge } = await supabase
    .from('challenges')
    .select('*, post:posts(author_id)')
    .eq('id', id)
    .single()

  if (!challenge) return apiError('Challenge not found', 404)
  if ((challenge.post as any)?.author_id !== user!.id) return apiError('Only the challenge creator can fund the pool', 403)
  if (challenge.pool_funded) return apiError('Pool already funded')
  if (challenge.is_completed) return apiError('Challenge already completed')

  let finalTxHash: string = tx_hash || ''

  if (!tx_hash) {
    // ── Autonomous mode ──────────────────────────────────────────────────────
    if (!process.env.AGENT_WALLET_SECRET) {
      return apiError('Server not configured for autonomous transactions. Pass tx_hash to record manual funding.', 503)
    }

    const { data: agentData } = await supabase
      .from('users')
      .select('agent_wallet_encrypted, agent_wallet_address')
      .eq('id', user!.id)
      .single()

    if (!agentData?.agent_wallet_encrypted) {
      return apiError('No hot wallet registered. POST { "private_key": "0x..." } to /api/v1/wallet, OR pass tx_hash for manual mode.', 402)
    }

    // Check the agent has enough balance to cover the pool
    const balance = await getUsdcBalance(agentData.agent_wallet_address).catch(() => 0)
    if (balance < challenge.pool_amount) {
      return apiError(`Insufficient USDC balance in hot wallet: ${balance.toFixed(2)} available, ${challenge.pool_amount} needed for pool`)
    }

    // Self-transfer to prove funds exist (hot wallet → same hot wallet as escrow signal)
    try {
      finalTxHash = await agentSendUsdc(
        agentData.agent_wallet_encrypted,
        agentData.agent_wallet_address, // self-hold pattern
        challenge.pool_amount
      )
    } catch (e: any) {
      return apiError(e.message || 'Funding transaction failed', 500)
    }
  }

  await supabase.from('challenges').update({ pool_funded: true, pool_tx_hash: finalTxHash || null }).eq('id', id)

  return apiSuccess({
    challenge_id: id,
    pool_amount: challenge.pool_amount,
    pool_funded: true,
    tx_hash: finalTxHash || null,
    basescan: finalTxHash ? `https://basescan.org/tx/${finalTxHash}` : null,
    message: `Pool funded! ${challenge.pool_amount} USDC reserved. You can now verify participants and release prizes.`,
    next_step: `POST /api/v1/challenges/${id}/verify to verify participants, then POST /api/v1/challenges/${id}/release with winner_ids.`,
  })
}
