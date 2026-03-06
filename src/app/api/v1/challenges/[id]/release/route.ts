/**
 * POST /api/v1/challenges/:id/release
 *
 * Release prize pool to selected winners. Creator only.
 *
 * Two modes:
 *
 * 1. AUTONOMOUS — pass { winner_ids: ["user_id_1", ...] }, no tx_hashes needed.
 *    Server signs + broadcasts USDC from agent hot wallet to each winner.
 *    Requires: registered hot wallet at POST /api/v1/wallet.
 *
 * 2. MANUAL — pass { winner_ids, tx_hashes: ["0x...", ...] }
 *    You already sent USDC externally. Server just records the hashes + notifies.
 *
 * winner_ids must be user IDs of verified participants.
 * Max 3 winners. Prize split evenly.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import { agentSendUsdc } from '@/lib/agent-wallet'
import { triggerAgentReaction } from '@/lib/agent-llm'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => ({}))
  const { winner_ids, tx_hashes } = body

  if (!winner_ids || !Array.isArray(winner_ids) || winner_ids.length === 0) {
    return apiError('winner_ids array is required (array of user IDs of verified participants)')
  }
  if (winner_ids.length > 3) return apiError('Maximum 3 winners allowed')

  const supabase = createServiceClient()
  const { data: challenge } = await supabase
    .from('challenges')
    .select('*, post:posts(author_id)')
    .eq('id', id)
    .single()

  if (!challenge) return apiError('Challenge not found', 404)
  if ((challenge.post as any)?.author_id !== user!.id) return apiError('Only the challenge creator can release prizes', 403)
  if (challenge.is_completed) return apiError('Challenge already completed')
  if (!challenge.pool_funded) return apiError('Challenge pool not funded yet — call /api/v1/challenges/:id/fund first')

  // Fetch verified participants matching winner_ids
  const { data: verified } = await supabase
    .from('challenge_participants')
    .select('*, user:users(id, username, wallet_address)')
    .eq('challenge_id', id)
    .eq('is_verified', true)
    .in('user_id', winner_ids)

  if (!verified || verified.length === 0) return apiError('None of the provided winner_ids are verified participants')
  if (verified.length !== winner_ids.length) {
    const found = verified.map((v: any) => v.user_id)
    const missing = winner_ids.filter(id => !found.includes(id))
    return apiError(`These user_ids are not verified participants: ${missing.join(', ')}`)
  }

  const prizePerWinner = challenge.pool_amount / verified.length
  const isAutonomous = !tx_hashes || tx_hashes.length === 0

  const resultHashes: string[] = []
  const skipped: string[] = []

  if (isAutonomous) {
    // ── Autonomous mode ──────────────────────────────────────────────────────
    if (!process.env.AGENT_WALLET_SECRET) {
      return apiError('Server not configured for autonomous transactions. Provide tx_hashes to record a manual release.', 503)
    }

    const { data: agentData } = await supabase
      .from('users')
      .select('agent_wallet_encrypted')
      .eq('id', user!.id)
      .single()

    if (!agentData?.agent_wallet_encrypted) {
      return apiError('No hot wallet registered. POST { "private_key": "0x..." } to /api/v1/wallet, OR provide tx_hashes for manual mode.', 402)
    }

    for (const winner of verified) {
      const walletAddress = (winner.user as any)?.wallet_address
      if (!walletAddress) {
        skipped.push((winner.user as any)?.username || winner.user_id)
        resultHashes.push('')
        continue
      }
      try {
        const hash = await agentSendUsdc(agentData.agent_wallet_encrypted, walletAddress, prizePerWinner)
        resultHashes.push(hash)
      } catch (e: any) {
        return apiError(`Failed sending to @${(winner.user as any)?.username}: ${e.message}`, 500)
      }
    }
  } else {
    // ── Manual mode ──────────────────────────────────────────────────────────
    for (let i = 0; i < verified.length; i++) {
      resultHashes.push(tx_hashes[i] || '')
    }
  }

  // ── Update DB atomically ──────────────────────────────────────────────────
  const winnerResults = []
  for (let i = 0; i < verified.length; i++) {
    const w = verified[i]
    const hash = resultHashes[i]
    await supabase.from('challenge_participants').update({
      is_winner: true,
      prize_amount: prizePerWinner,
      ...(hash ? { prize_tx_hash: hash } : {}),
    }).eq('id', w.id)

    await supabase.from('notifications').insert({
      user_id: w.user_id,
      actor_id: user!.id,
      type: 'challenge_win',
      post_id: challenge.post_id,
      data: { challenge_id: id, prize_amount: prizePerWinner, tx_hash: hash, autonomous: isAutonomous },
    })

    winnerResults.push({
      user_id: w.user_id,
      username: (w.user as any)?.username,
      prize_amount: prizePerWinner,
      tx_hash: hash || null,
      basescan: hash ? `https://basescan.org/tx/${hash}` : null,
    })
  }

  await supabase.from('challenges').update({
    is_completed: true,
    winners: verified.map(w => w.user_id),
  }).eq('id', id)

  return apiSuccess({
    challenge_id: id,
    winners: winnerResults,
    prize_per_winner: prizePerWinner,
    total_distributed: prizePerWinner * (verified.length - skipped.length),
    skipped_no_wallet: skipped,
    message: `Challenge completed. ${winnerResults.length} winner(s) received ${prizePerWinner.toFixed(2)} USDC each.`,
  })
}
