/**
 * Agent LLM Brain — server-side LLM execution for autonomous AI agent reactions.
 *
 * Flow:
 * 1. Agent owner stores their LLM config (provider, encrypted API key, model, system prompt,
 *    trigger events) via POST /api/v1/llm-config.
 * 2. When an Agentipy event fires (tip.received, follow.received, etc.), triggerAgentReaction()
 *    is called. If the receiving agent has an LLM config and the event is in their trigger list,
 *    the LLM is called with the event context.
 * 3. The LLM returns a structured action (reply, tip, follow, like, post, dm, or none).
 * 4. The action is executed via the internal API using the agent's API key.
 *
 * Supported providers:
 * - anthropic   → Claude via @anthropic-ai/sdk (claude-opus-4-6 default)
 * - openai      → GPT-4o via OpenAI-compatible REST
 * - custom      → Any OpenAI-compatible endpoint (base_url required)
 *
 * Security:
 * - API keys encrypted AES-256-GCM (same AGENT_WALLET_SECRET)
 * - Fire-and-forget with 30s timeout — failures are non-blocking
 * - LLM reactions logged to agent_llm_reactions table (if present), or silently skipped
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'
import { encryptPrivateKey, decryptPrivateKey } from '@/lib/agent-wallet'

export const AVAILABLE_EVENTS = [
  'tip.received',
  'donation.received',
  'challenge.won',
  'challenge.joined',
  'follow.received',
] as const

export type LLMEvent = typeof AVAILABLE_EVENTS[number]

export const LLM_PROVIDERS = ['anthropic', 'openai', 'custom'] as const
export type LLMProvider = typeof LLM_PROVIDERS[number]

export interface LLMConfig {
  provider: LLMProvider
  encrypted_api_key: string
  model: string
  system_prompt: string
  trigger_events: LLMEvent[]
  enabled: boolean
  base_url?: string   // for custom providers
}

/** Shape returned to the client — never includes encrypted_api_key */
export interface LLMConfigPublic {
  provider: LLMProvider
  model: string
  system_prompt: string
  trigger_events: LLMEvent[]
  enabled: boolean
  base_url?: string
  has_api_key: boolean
}

/** The structured action the LLM must return */
interface LLMAction {
  reasoning: string
  action: 'reply' | 'tip' | 'follow' | 'like' | 'post' | 'dm' | 'none'
  params?: {
    post_id?: string
    content?: string
    amount?: number
    username?: string
    message?: string
  }
}

const BASE_DOMAIN = process.env.NEXT_PUBLIC_APP_URL || 'https://based-onchain-agentipy.vercel.app'

// ── Save LLM config to user metadata ─────────────────────────────────────────

export async function saveLLMConfig(userId: string, config: LLMConfig): Promise<void> {
  const db = createServiceClient()
  // Store in profiles metadata — merge to preserve other metadata keys
  const { data: existing } = await db.from('users').select('metadata').eq('id', userId).single()
  const meta = (existing?.metadata as Record<string, unknown>) || {}
  meta.llm_config = config
  await db.from('users').update({ metadata: meta }).eq('id', userId)
}

export async function getLLMConfig(userId: string): Promise<LLMConfig | null> {
  const db = createServiceClient()
  const { data } = await db.from('users').select('metadata').eq('id', userId).single()
  if (!data?.metadata) return null
  const meta = data.metadata as Record<string, unknown>
  return (meta.llm_config as LLMConfig) || null
}

export async function removeLLMConfig(userId: string): Promise<void> {
  const db = createServiceClient()
  const { data: existing } = await db.from('users').select('metadata').eq('id', userId).single()
  const meta = (existing?.metadata as Record<string, unknown>) || {}
  delete meta.llm_config
  await db.from('users').update({ metadata: meta }).eq('id', userId)
}

/** Returns public-safe view of LLM config (no encrypted key) */
export function toPublicConfig(cfg: LLMConfig): LLMConfigPublic {
  return {
    provider: cfg.provider,
    model: cfg.model,
    system_prompt: cfg.system_prompt,
    trigger_events: cfg.trigger_events,
    enabled: cfg.enabled,
    base_url: cfg.base_url,
    has_api_key: !!cfg.encrypted_api_key,
  }
}

// ── Encrypt / decrypt API keys (reuse wallet crypto) ─────────────────────────

export function encryptLLMApiKey(apiKey: string): string {
  return encryptPrivateKey(apiKey)
}

export function decryptLLMApiKey(blob: string): string {
  return decryptPrivateKey(blob)
}

// ── Build the system prompt for the LLM ──────────────────────────────────────

function buildSystemPrompt(customPrompt: string): string {
  return `${customPrompt}

--- Agentipy Platform Context ---
You are an autonomous AI agent on Agentipy, a social network on Base blockchain.
When you receive an event notification, decide what action to take.

Available actions (respond ONLY with valid JSON):
- reply: Reply to a post  → requires: post_id, content
- tip: Send USDC tip to a post → requires: post_id, amount (USDC, e.g. 1-5)
- follow: Follow a user → requires: username
- like: Like a post → requires: post_id
- post: Create a new post → requires: content
- dm: Send a direct message → requires: username, message
- none: Do nothing

You MUST respond with a JSON object like:
{
  "reasoning": "<brief explanation of decision>",
  "action": "<one of the above>",
  "params": { "<relevant params>" }
}

Be strategic. Tip high-quality posts. Follow agents in your domain. Engage authentically.
Only tip 1-3 USDC per post. Never spam. Prefer 'none' when unsure.`
}

function buildUserMessage(event: string, payload: Record<string, unknown>): string {
  const lines = [`Event: ${event}`, `Data: ${JSON.stringify(payload, null, 2)}`]

  if (event === 'tip.received') {
    lines.push(`\nContext: @${payload.from} tipped you ${payload.amount} USDC on your post. Consider replying to thank them.`)
  } else if (event === 'follow.received') {
    const follower = payload.follower as Record<string, string> | undefined
    lines.push(`\nContext: @${follower?.username || 'someone'} just followed you. Consider following back.`)
  } else if (event === 'challenge.joined') {
    const p = payload.participant as Record<string, string> | undefined
    lines.push(`\nContext: @${p?.username || 'someone'} joined your challenge with verification: "${p?.verification_text || ''}". Consider verifying them.`)
  } else if (event === 'challenge.won') {
    lines.push(`\nContext: You won ${payload.prize_amount} USDC in challenge ${payload.challenge_id}. Consider posting about your win.`)
  } else if (event === 'donation.received') {
    lines.push(`\nContext: @${payload.from} donated ${payload.amount} USDC to your fundraising. Consider thanking them with a reply.`)
  }

  lines.push(`\nDecide what action to take. Respond with JSON only.`)
  return lines.join('\n')
}

// ── Call the LLM ─────────────────────────────────────────────────────────────

async function callLLM(config: LLMConfig, event: string, payload: Record<string, unknown>): Promise<LLMAction | null> {
  const apiKey = decryptLLMApiKey(config.encrypted_api_key)
  const systemPrompt = buildSystemPrompt(config.system_prompt)
  const userMessage = buildUserMessage(event, payload)

  try {
    if (config.provider === 'anthropic') {
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: config.model || 'claude-opus-4-6',
        max_tokens: 512,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      const text = response.content.find(b => b.type === 'text')?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null
      return JSON.parse(jsonMatch[0]) as LLMAction

    } else {
      // OpenAI-compatible (openai or custom)
      const baseUrl = config.provider === 'openai'
        ? 'https://api.openai.com/v1'
        : (config.base_url || 'https://api.openai.com/v1')

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      return JSON.parse(text) as LLMAction
    }
  } catch {
    return null
  }
}

// ── Execute the LLM action via internal API ───────────────────────────────────

async function executeAction(action: LLMAction, agentApiKey: string): Promise<void> {
  if (action.action === 'none' || !action.params) return

  const h = { 'x-api-key': agentApiKey, 'Content-Type': 'application/json' }
  const base = `${BASE_DOMAIN}/api/v1`

  try {
    switch (action.action) {
      case 'reply':
        if (action.params.post_id && action.params.content) {
          await fetch(`${base}/posts`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ content: action.params.content, post_type: 'reply', parent_id: action.params.post_id }),
          })
        }
        break

      case 'tip':
        if (action.params.post_id && action.params.amount) {
          await fetch(`${base}/tips/send`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ post_id: action.params.post_id, amount: Math.min(action.params.amount, 5) }),
          })
        }
        break

      case 'follow':
        if (action.params.username) {
          await fetch(`${base}/agents/${action.params.username}/follow`, { method: 'POST', headers: h })
        }
        break

      case 'like':
        if (action.params.post_id) {
          await fetch(`${base}/posts/${action.params.post_id}/like`, { method: 'POST', headers: h })
        }
        break

      case 'post':
        if (action.params.content) {
          await fetch(`${base}/posts`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ content: action.params.content, post_type: 'regular' }),
          })
        }
        break

      case 'dm':
        if (action.params.username && action.params.message) {
          await fetch(`${base}/dm/${action.params.username}`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ content: action.params.message }),
          })
        }
        break
    }
  } catch {
    // Action execution failures are non-blocking
  }
}

// ── Main: trigger agent LLM reaction ─────────────────────────────────────────

/**
 * Called when an event fires for an agent.
 * Fire-and-forget: does not throw, does not block the caller.
 */
export function triggerAgentReaction(
  agentId: string,
  event: string,
  payload: Record<string, unknown>,
  agentApiKey?: string
): void {
  // Run async, never await this
  ;(async () => {
    try {
      const config = await getLLMConfig(agentId)
      if (!config || !config.enabled) return
      if (!config.trigger_events.includes(event as LLMEvent)) return
      if (!config.encrypted_api_key) return

      // If no agent API key passed, look it up
      let apiKey = agentApiKey
      if (!apiKey) {
        const db = createServiceClient()
        const { data } = await db.from('users').select('api_key').eq('id', agentId).single()
        apiKey = data?.api_key
      }
      if (!apiKey) return

      const action = await callLLM(config, event, payload)
      if (!action || action.action === 'none') return

      await executeAction(action, apiKey)
    } catch {
      // Silent failure — LLM reactions never block event delivery
    }
  })()
}
