/**
 * Agent Wallet — server-side transaction signing for autonomous AI agents.
 *
 * Design:
 * - Each agent may register a "hot wallet" private key encrypted with AES-256-GCM
 *   using AGENT_WALLET_SECRET (server env var). The encrypted blob is stored in
 *   users.agent_wallet_encrypted (never exposed via API).
 * - When an agent calls a transaction endpoint, the server decrypts the key,
 *   builds a viem WalletClient, signs and broadcasts the tx directly to Base RPC.
 * - No MetaMask. No browser. No user approval popup needed.
 *
 * Security:
 * - AGENT_WALLET_SECRET must be a 32+ char string in env
 * - Private keys AES-256-GCM encrypted at rest — never plain text in DB
 * - Daily spend limits enforced in checkSpendLimit()
 * - In-memory rate limiter: max 10 tx per agent per 60s
 * - Balance check before every send
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase'

// USDC on Base mainnet
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
const WALLET_SECRET = process.env.AGENT_WALLET_SECRET || ''

// ── In-memory rate limiter: 10 tx per 60s per agent ─────────────────────────
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
const RATE_MAX = 10
const RATE_WINDOW_MS = 60_000

export function checkRateLimit(agentId: string): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now()
  let bucket = rateBuckets.get(agentId)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS }
    rateBuckets.set(agentId, bucket)
  }
  if (bucket.count >= RATE_MAX) {
    return { allowed: false, remaining: 0, resetInMs: bucket.resetAt - now }
  }
  bucket.count++
  return { allowed: true, remaining: RATE_MAX - bucket.count, resetInMs: bucket.resetAt - now }
}

// ── Daily spend limit check ──────────────────────────────────────────────────

export interface SpendLimitConfig {
  daily_limit: number       // max USDC to spend per UTC day (0 = unlimited)
  per_tx_limit: number      // max USDC per single tx (0 = unlimited)
}

export async function checkSpendLimit(
  agentId: string,
  amount: number,
  config: SpendLimitConfig
): Promise<{ allowed: boolean; reason?: string; spent_today: number }> {
  if (config.per_tx_limit > 0 && amount > config.per_tx_limit) {
    return { allowed: false, reason: `Amount ${amount} USDC exceeds per-tx limit of ${config.per_tx_limit} USDC`, spent_today: 0 }
  }
  if (config.daily_limit === 0) return { allowed: true, spent_today: 0 }

  const db = createServiceClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const todayStart = `${today}T00:00:00.000Z`
  const todayEnd   = `${today}T23:59:59.999Z`

  const { data } = await db
    .from('agent_tx_log')
    .select('amount')
    .eq('agent_id', agentId)
    .eq('status', 'confirmed')
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)

  const spentToday = (data || []).reduce((s, r) => s + (r.amount || 0), 0)
  if (spentToday + amount > config.daily_limit) {
    return {
      allowed: false,
      reason: `Daily spend limit reached: ${spentToday.toFixed(2)} spent today, limit is ${config.daily_limit} USDC`,
      spent_today: spentToday,
    }
  }
  return { allowed: true, spent_today: spentToday }
}

// ── Log a tx to agent_tx_log ─────────────────────────────────────────────────

export async function logAgentTx(params: {
  agent_id: string
  tx_type: 'tip' | 'donate' | 'fund_challenge' | 'release_reward'
  to_user_id?: string
  post_id?: string
  amount: number
  tx_hash: string
  status: 'pending' | 'confirmed' | 'failed'
  meta?: Record<string, unknown>
}) {
  const db = createServiceClient()
  await db.from('agent_tx_log').insert({
    agent_id: params.agent_id,
    tx_type: params.tx_type,
    to_user_id: params.to_user_id || null,
    post_id: params.post_id || null,
    amount: params.amount,
    tx_hash: params.tx_hash,
    status: params.status,
    meta: params.meta || {},
  })
}

// ── Webhook fire ─────────────────────────────────────────────────────────────

export async function fireWebhook(
  webhookUrl: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agentipy-event': event },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload }),
      signal: AbortSignal.timeout(5000), // 5s timeout
    })
  } catch {
    // Webhook failures are non-blocking — log but don't throw
  }
}

// ── Encryption helpers ───────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  if (!WALLET_SECRET || WALLET_SECRET.length < 32) {
    throw new Error('AGENT_WALLET_SECRET env var not set or too short (need 32+ chars)')
  }
  return createHash('sha256').update(WALLET_SECRET).digest()
}

export function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decryptPrivateKey(blob: string): string {
  const key = getEncryptionKey()
  const [ivHex, tagHex, ctHex] = blob.split(':')
  if (!ivHex || !tagHex || !ctHex) throw new Error('Invalid encrypted key format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ct = Buffer.from(ctHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ── viem clients ─────────────────────────────────────────────────────────────

export function getPublicClient() {
  return createPublicClient({ chain: base, transport: http(BASE_RPC) })
}

export function getAgentWalletClient(encryptedKey: string) {
  const pk = decryptPrivateKey(encryptedKey) as `0x${string}`
  const account = privateKeyToAccount(pk)
  const client = createWalletClient({ account, chain: base, transport: http(BASE_RPC) })
  return { client, account, address: account.address }
}

export async function getUsdcBalance(address: string): Promise<number> {
  const pub = getPublicClient()
  const raw = await pub.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
  return Number(raw) / 1_000_000
}

/** Transfer USDC from agent hot wallet to `to`. Returns tx hash. */
export async function agentSendUsdc(
  encryptedKey: string,
  to: string,
  amount: number
): Promise<`0x${string}`> {
  const { client, account } = getAgentWalletClient(encryptedKey)
  const amountUnits = parseUnits(amount.toFixed(6), 6)

  const balance = await getUsdcBalance(account.address)
  if (balance < amount) {
    throw new Error(`Insufficient USDC balance: ${balance.toFixed(2)} available, ${amount} required`)
  }

  const data = encodeFunctionData({ abi: USDC_ABI, functionName: 'transfer', args: [to as `0x${string}`, amountUnits] })
  const hash = await client.sendTransaction({ to: USDC_ADDRESS, data, chain: base })
  return hash
}

export function privateKeyToAddress(pk: string): string {
  try { return privateKeyToAccount(pk as `0x${string}`).address } catch { return '' }
}

export function isValidPrivateKey(pk: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(pk)
}
