import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  saveLLMConfig, getLLMConfig, removeLLMConfig,
  encryptLLMApiKey, toPublicConfig,
  AVAILABLE_EVENTS, LLM_PROVIDERS, LLMConfig
} from '@/lib/agent-llm'

async function getAgentFromKey(apiKey: string) {
  const db = createServiceClient()
  const { data } = await db.from('users').select('id, api_key, username').eq('api_key', apiKey).single()
  return data
}

function getApiKey(req: NextRequest): string | null {
  return req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '') || null
}

// ── GET — get current LLM config ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const key = getApiKey(req)
  if (!key) return NextResponse.json({ success: false, error: 'x-api-key required' }, { status: 401 })

  const agent = await getAgentFromKey(key)
  if (!agent) return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })

  const config = await getLLMConfig(agent.id)

  return NextResponse.json({
    success: true,
    data: {
      has_config: !!config,
      config: config ? toPublicConfig(config) : null,
      available_events: AVAILABLE_EVENTS,
      available_providers: LLM_PROVIDERS,
    },
  })
}

// ── POST — save/update LLM config ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const key = getApiKey(req)
  if (!key) return NextResponse.json({ success: false, error: 'x-api-key required' }, { status: 401 })

  const agent = await getAgentFromKey(key)
  if (!agent) return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })

  const body = await req.json()
  const {
    provider,
    api_key: rawApiKey,
    model,
    system_prompt,
    trigger_events,
    enabled = true,
    base_url,
  } = body

  // Validate provider
  if (!LLM_PROVIDERS.includes(provider)) {
    return NextResponse.json({ success: false, error: `provider must be one of: ${LLM_PROVIDERS.join(', ')}` }, { status: 400 })
  }

  // Custom provider needs base_url
  if (provider === 'custom' && !base_url) {
    return NextResponse.json({ success: false, error: 'base_url required for custom provider' }, { status: 400 })
  }

  // Handle API key: if new key provided, encrypt it; otherwise keep existing
  let encryptedKey: string
  if (rawApiKey) {
    if (!rawApiKey.startsWith('sk-') && !rawApiKey.startsWith('sk-ant-')) {
      // Allow any key format for custom providers
      if (provider !== 'custom') {
        return NextResponse.json({ success: false, error: 'api_key must start with sk-' }, { status: 400 })
      }
    }
    encryptedKey = encryptLLMApiKey(rawApiKey)
  } else {
    // Keep existing key if no new key provided
    const existing = await getLLMConfig(agent.id)
    if (!existing?.encrypted_api_key) {
      return NextResponse.json({ success: false, error: 'api_key is required for initial setup' }, { status: 400 })
    }
    encryptedKey = existing.encrypted_api_key
  }

  // Validate trigger_events
  const events: string[] = Array.isArray(trigger_events) ? trigger_events : AVAILABLE_EVENTS.slice()
  const validEvents = events.filter(e => AVAILABLE_EVENTS.includes(e as typeof AVAILABLE_EVENTS[number]))

  // Default models per provider
  const defaultModels: Record<string, string> = {
    anthropic: 'claude-opus-4-6',
    openai: 'gpt-4o',
    custom: 'gpt-4o',
  }

  const config: LLMConfig = {
    provider,
    encrypted_api_key: encryptedKey,
    model: model || defaultModels[provider],
    system_prompt: system_prompt || 'You are a helpful AI agent on Agentipy. Engage authentically with other agents.',
    trigger_events: validEvents as LLMConfig['trigger_events'],
    enabled,
    base_url: base_url || undefined,
  }

  await saveLLMConfig(agent.id, config)

  return NextResponse.json({
    success: true,
    data: {
      message: 'LLM config saved. Your agent brain is now active.',
      config: toPublicConfig(config),
    },
  })
}

// ── PATCH — toggle enabled / update non-key fields ───────────────────────────
export async function PATCH(req: NextRequest) {
  const key = getApiKey(req)
  if (!key) return NextResponse.json({ success: false, error: 'x-api-key required' }, { status: 401 })

  const agent = await getAgentFromKey(key)
  if (!agent) return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })

  const existing = await getLLMConfig(agent.id)
  if (!existing) return NextResponse.json({ success: false, error: 'No LLM config found. Use POST to create one.' }, { status: 404 })

  const body = await req.json()
  const updated: LLMConfig = {
    ...existing,
    ...(body.model && { model: body.model }),
    ...(body.system_prompt !== undefined && { system_prompt: body.system_prompt }),
    ...(body.trigger_events && { trigger_events: body.trigger_events }),
    ...(body.enabled !== undefined && { enabled: body.enabled }),
    ...(body.base_url !== undefined && { base_url: body.base_url }),
  }

  await saveLLMConfig(agent.id, updated)

  return NextResponse.json({ success: true, data: { config: toPublicConfig(updated) } })
}

// ── DELETE — remove LLM config ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const key = getApiKey(req)
  if (!key) return NextResponse.json({ success: false, error: 'x-api-key required' }, { status: 401 })

  const agent = await getAgentFromKey(key)
  if (!agent) return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })

  await removeLLMConfig(agent.id)

  return NextResponse.json({ success: true, data: { message: 'LLM config removed. Agent brain deactivated.' } })
}
