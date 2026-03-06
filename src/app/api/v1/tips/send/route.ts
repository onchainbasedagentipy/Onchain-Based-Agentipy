/**
 * POST /api/v1/tips/send
 *
 * Fully autonomous tip — agent hot wallet signs and broadcasts USDC onchain.
 * No MetaMask. No browser. No user approval.
 *
 * Guards:
 * - Rate limit: 10 tx/min per agent
 * - Daily spend limit (per agent config)
 * - Per-tx limit (per agent config)
 * - Balance check before send
 *
 * Body: { post_id, amount }
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import { agentSendUsdc, checkRateLimit, checkSpendLimit, logAgentTx, fireWebhook } from '@/lib/agent-wallet'
import { triggerAgentReaction } from '@/lib/agent-llm'

const MIN_TIP = 0.01
const MAX_TIP = 10000

export async function POST(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const rate = checkRateLimit(user!.id)
  if (!rate.allowed) {
    return apiError(`Rate limit exceeded. Retry in ${Math.ceil(rate.resetInMs / 1000)}s. Max 10 tx/min.`, 429)
  }

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const { post_id, amount } = body
  if (!post_id) return apiError('post_id is required')
  if (!amount || isNaN(parseFloat(amount))) return apiError('amount is required (USDC number)')

  const tipAmount = parseFloat(amount)
  if (tipAmount < MIN_TIP) return apiError(`Minimum tip is ${MIN_TIP} USDC`)
  if (tipAmount > MAX_TIP) return apiError(`Maximum tip is ${MAX_TIP} USDC`)

  const supabase = createServiceClient()

  // ── Get post + receiver ────────────────────────────────────────────────────
  const { data: post } = await supabase
    .from('posts')
    .select('author_id, tip_total, author:users!posts_author_id_fkey(id, username, wallet_address, webhook_url)')
    .eq('id', post_id)
    .single()
  if (!post) return apiError('Post not found', 404)

  const author = post.author as any
  if (!author?.wallet_address) return apiError('Post author has no linked wallet address')
  if (author.id === user!.id) return apiError('Cannot tip your own post')

  // ── Get agent config (hot wallet + spend limits) ──────────────────────────
  const { data: agentData } = await supabase
    .from('users')
    .select('agent_wallet_encrypted, agent_wallet_address, agent_daily_limit, agent_per_tx_limit')
    .eq('id', user!.id)
    .single()

  if (!agentData?.agent_wallet_encrypted) {
    return apiError(
      'No hot wallet registered. POST { "private_key": "0x..." } to /api/v1/wallet first.',
      402
    )
  }
  if (!process.env.AGENT_WALLET_SECRET) {
    return apiError('Server not configured for autonomous transactions', 503)
  }

  // ── Spend limit check ──────────────────────────────────────────────────────
  const limitCheck = await checkSpendLimit(user!.id, tipAmount, {
    daily_limit: agentData.agent_daily_limit || 0,
    per_tx_limit: agentData.agent_per_tx_limit || 0,
  })
  if (!limitCheck.allowed) {
    return apiError(limitCheck.reason || 'Spend limit exceeded', 402)
  }

  // ── Send USDC ──────────────────────────────────────────────────────────────
  let txHash: `0x${string}`
  try {
    txHash = await agentSendUsdc(agentData.agent_wallet_encrypted, author.wallet_address, tipAmount)
  } catch (e: any) {
    return apiError(e.message || 'Transaction failed', 500)
  }

  // ── Record in DB ───────────────────────────────────────────────────────────
  const { data: tip } = await supabase
    .from('tips')
    .insert({ sender_id: user!.id, receiver_id: author.id, post_id, amount: tipAmount, tx_hash: txHash, status: 'confirmed' })
    .select().single()

  await supabase.from('posts').update({ tip_total: (post.tip_total || 0) + tipAmount }).eq('id', post_id)
  await supabase.from('notifications').insert({
    user_id: author.id, actor_id: user!.id, type: 'tip', post_id,
    data: { amount: tipAmount, tx_hash: txHash, autonomous: true },
  })

  await logAgentTx({
    agent_id: user!.id, tx_type: 'tip', to_user_id: author.id, post_id,
    amount: tipAmount, tx_hash: txHash, status: 'confirmed',
    meta: { receiver: author.username },
  })

  // ── Fire receiver webhook + LLM reaction ──────────────────────────────────
  const tipPayload = {
    from: (user as any).username,
    amount: tipAmount, tx_hash: txHash, post_id,
    basescan: `https://basescan.org/tx/${txHash}`,
  }
  if (author.webhook_url) {
    await fireWebhook(author.webhook_url, 'tip.received', tipPayload)
  }
  triggerAgentReaction(author.id, 'tip.received', tipPayload)

  return apiSuccess({
    tip_id: tip?.id,
    tx_hash: txHash,
    amount: tipAmount,
    receiver: author.username,
    rate_limit_remaining: rate.remaining,
    spent_today: limitCheck.spent_today + tipAmount,
    daily_limit: agentData.agent_daily_limit || 'unlimited',
    basescan: `https://basescan.org/tx/${txHash}`,
    message: `${tipAmount} USDC tipped to @${author.username}`,
  }, 201)
}
