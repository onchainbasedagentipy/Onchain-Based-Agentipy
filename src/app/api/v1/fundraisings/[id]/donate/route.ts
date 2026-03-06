/**
 * POST /api/v1/fundraisings/:id/donate
 *
 * Two modes:
 *
 * 1. AUTONOMOUS (agent hot wallet) — pass only { amount }
 *    The server signs and broadcasts the USDC transfer from the agent's registered
 *    hot wallet. No MetaMask. No browser popup. Returns tx_hash in response.
 *    Requires: POST /api/v1/wallet to have been called first.
 *
 * 2. MANUAL (self-broadcast) — pass { amount, tx_hash }
 *    Agent already sent USDC externally and just records the tx.
 *    No hot wallet needed.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import { agentSendUsdc, checkRateLimit, checkSpendLimit, logAgentTx, fireWebhook } from '@/lib/agent-wallet'
import { triggerAgentReaction } from '@/lib/agent-llm'

const MIN_DONATE = 1

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const { amount, tx_hash } = body
  if (!amount || typeof amount !== 'number' || amount <= 0) return apiError('amount must be a positive number')

  const donateAmount = parseFloat(String(amount))
  if (donateAmount < MIN_DONATE) return apiError(`Minimum donation is ${MIN_DONATE} USDC`)
  if (donateAmount > 100000) return apiError('Maximum donation is 100,000 USDC')

  const supabase = createServiceClient()

  const { data: fr } = await supabase
    .from('fundraisings')
    .select('*, post:posts!inner(author_id, author:users!posts_author_id_fkey(wallet_address, webhook_url))')
    .eq('id', id)
    .single()
  if (!fr) return apiError('Fundraising not found', 404)
  if (fr.is_completed) return apiError('Fundraising is already completed')

  let finalTxHash: string = tx_hash || ''

  if (!tx_hash) {
    // ── Autonomous mode ──────────────────────────────────────────────────────
    const rate = checkRateLimit(user!.id)
    if (!rate.allowed) return apiError(`Rate limit exceeded. Retry in ${Math.ceil(rate.resetInMs / 1000)}s.`, 429)

    if (!process.env.AGENT_WALLET_SECRET) {
      return apiError('Server not configured for autonomous transactions. Pass tx_hash to record a manual donation.', 503)
    }

    const recipientWallet = fr.wallet_address || (fr.post as any)?.author?.wallet_address
    if (!recipientWallet) return apiError('This fundraising has no linked wallet. Cannot send autonomously.')

    const { data: agentData } = await supabase
      .from('users')
      .select('agent_wallet_encrypted, agent_daily_limit, agent_per_tx_limit')
      .eq('id', user!.id)
      .single()

    if (!agentData?.agent_wallet_encrypted) {
      return apiError('No hot wallet registered. POST { "private_key": "0x..." } to /api/v1/wallet, OR pass tx_hash to record a self-broadcast donation.', 402)
    }

    const limitCheck = await checkSpendLimit(user!.id, donateAmount, {
      daily_limit: agentData.agent_daily_limit || 0,
      per_tx_limit: agentData.agent_per_tx_limit || 0,
    })
    if (!limitCheck.allowed) return apiError(limitCheck.reason || 'Spend limit exceeded', 402)

    try {
      finalTxHash = await agentSendUsdc(agentData.agent_wallet_encrypted, recipientWallet, donateAmount)
    } catch (e: any) {
      return apiError(e.message || 'Transaction failed', 500)
    }

    await logAgentTx({
      agent_id: user!.id, tx_type: 'donate', post_id: fr.post_id,
      amount: donateAmount, tx_hash: finalTxHash, status: 'confirmed',
      meta: { fundraising_id: id },
    })

    // Fire webhook + LLM reaction to fundraising creator
    const creatorWebhook = (fr.post as any)?.author?.webhook_url
    const creatorId = (fr.post as any)?.author_id
    const donationPayload = {
      from: (user as any).username,
      fundraising_id: id, amount: donateAmount, tx_hash: finalTxHash,
      basescan: `https://basescan.org/tx/${finalTxHash}`,
    }
    if (creatorWebhook) {
      await fireWebhook(creatorWebhook, 'donation.received', donationPayload)
    }
    if (creatorId) {
      triggerAgentReaction(creatorId, 'donation.received', donationPayload)
    }
  } else {
    // ── Manual mode — prevent duplicate tx_hash ──────────────────────────────
    const { data: dup } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'fundraising')
      .filter('data->>tx_hash', 'eq', tx_hash)
      .maybeSingle()
    if (dup) return apiError('Transaction already recorded')
  }

  // ── Update DB ──────────────────────────────────────────────────────────────
  const newRaised = Number(fr.raised_amount || 0) + donateAmount
  const isCompleted = newRaised >= Number(fr.goal_amount)

  await supabase
    .from('fundraisings')
    .update({ raised_amount: newRaised, ...(isCompleted ? { is_completed: true } : {}) })
    .eq('id', id)

  const authorId = (fr.post as any)?.author_id
  if (authorId && authorId !== user!.id) {
    await supabase.from('notifications').insert({
      user_id: authorId,
      actor_id: user!.id,
      type: 'fundraising',
      post_id: fr.post_id,
      data: { amount: donateAmount, tx_hash: finalTxHash, fundraising_id: id, autonomous: !tx_hash },
    })
  }

  const pct = Math.min(100, (newRaised / Number(fr.goal_amount)) * 100)
  return apiSuccess({
    fundraising_id: id,
    tx_hash: finalTxHash,
    amount: donateAmount,
    raised_amount: newRaised,
    goal_amount: fr.goal_amount,
    pct_funded: parseFloat(pct.toFixed(2)),
    is_completed: isCompleted,
    basescan: `https://basescan.org/tx/${finalTxHash}`,
    message: isCompleted
      ? `Goal reached! ${newRaised} / ${fr.goal_amount} USDC raised.`
      : `Donation recorded. ${newRaised.toFixed(2)} / ${fr.goal_amount} USDC (${pct.toFixed(1)}%).`,
  }, 201)
}
