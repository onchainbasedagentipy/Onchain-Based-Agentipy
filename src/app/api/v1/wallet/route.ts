/**
 * /api/v1/wallet
 *
 * POST — Register or update the agent's hot wallet (encrypted private key)
 * GET  — Get hot wallet info (address + USDC balance). Never returns the key.
 * DELETE — Remove the hot wallet (wipe encrypted key from DB)
 *
 * This endpoint enables fully autonomous onchain transactions.
 * The private key is AES-256-GCM encrypted server-side using AGENT_WALLET_SECRET.
 *
 * ⚠️  Security warning displayed to agents:
 *   Only fund this hot wallet with small amounts (tip/donation budget).
 *   It is a hot wallet meant for low-value autonomous tx, NOT cold storage.
 */

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import {
  encryptPrivateKey,
  decryptPrivateKey,
  isValidPrivateKey,
  privateKeyToAddress,
  getUsdcBalance,
  getAgentWalletClient,
} from '@/lib/agent-wallet'

/* ── POST: register hot wallet ─────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const { private_key } = body
  if (!private_key) return apiError('private_key is required')
  if (!isValidPrivateKey(private_key)) {
    return apiError('private_key must be a 0x-prefixed 32-byte hex string (0x + 64 hex chars)')
  }

  // Derive address for confirmation
  const walletAddress = privateKeyToAddress(private_key)
  if (!walletAddress) return apiError('Could not derive address from private key')

  // Check env is configured
  if (!process.env.AGENT_WALLET_SECRET) {
    return apiError('Server not configured for agent wallets (AGENT_WALLET_SECRET not set)', 503)
  }

  const encrypted = encryptPrivateKey(private_key)
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('users')
    .update({ agent_wallet_encrypted: encrypted, agent_wallet_address: walletAddress.toLowerCase() })
    .eq('id', user!.id)

  if (error) return apiError(error.message, 500)

  const balance = await getUsdcBalance(walletAddress).catch(() => 0)

  return apiSuccess({
    wallet_address: walletAddress,
    usdc_balance: balance,
    message: 'Hot wallet registered. Key encrypted and stored. Fund this address with USDC to enable autonomous transactions.',
    warning: 'Only store small operational budgets in this hot wallet. It is not cold storage.',
    capabilities: ['tip', 'donate', 'fund_challenge_pool', 'release_challenge_reward'],
  }, 201)
}

/* ── GET: wallet info (no key returned) ───────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('agent_wallet_address, agent_wallet_encrypted')
    .eq('id', user!.id)
    .single()

  if (!data?.agent_wallet_address) {
    return apiSuccess({
      has_wallet: false,
      message: 'No hot wallet registered. POST to /api/v1/wallet with { "private_key": "0x..." } to register one.',
    })
  }

  const balance = await getUsdcBalance(data.agent_wallet_address).catch(() => null)

  return apiSuccess({
    has_wallet: true,
    wallet_address: data.agent_wallet_address,
    usdc_balance: balance,
    usdc_balance_note: balance === null ? 'Could not fetch balance — RPC error' : undefined,
    capabilities: ['tip', 'donate', 'fund_challenge_pool', 'release_challenge_reward'],
    endpoints: {
      tip: 'POST /api/v1/tips/send',
      donate: 'POST /api/v1/fundraisings/{id}/donate',
      fund_challenge: 'POST /api/v1/challenges/{id}/fund',
      release_challenge: 'POST /api/v1/challenges/{id}/release',
    },
  })
}

/* ── DELETE: remove hot wallet ─────────────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  await supabase
    .from('users')
    .update({ agent_wallet_encrypted: null, agent_wallet_address: null })
    .eq('id', user!.id)

  return apiSuccess({ message: 'Hot wallet removed. No private key data retained.' })
}
