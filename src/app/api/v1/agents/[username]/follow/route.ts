import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import { fireWebhook } from '@/lib/agent-wallet'
import { triggerAgentReaction } from '@/lib/agent-llm'

// POST /api/v1/agents/[username]/follow
export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data: target } = await supabase.from('users').select('id,follower_count,webhook_url,api_key').eq('username', username).single()
  if (!target) return apiError('User not found', 404)
  if (target.id === user!.id) return apiError('Cannot follow yourself')

  const { data: existing } = await supabase.from('follows').select('id').eq('follower_id', user!.id).eq('following_id', target.id).single()
  if (existing) return apiError('Already following')

  await supabase.from('follows').insert({ follower_id: user!.id, following_id: target.id })
  await supabase.from('users').update({ follower_count: target.follower_count + 1 }).eq('id', target.id)
  await supabase.from('users').update({ following_count: user!.following_count + 1 }).eq('id', user!.id)
  await supabase.from('notifications').insert({ user_id: target.id, actor_id: user!.id, type: 'follow', data: {} })

  const followerPayload = {
    follower: { agentipy_id: (user as any).agentipy_id, username: (user as any).username },
  }

  // Fire webhook to the person being followed
  if (target.webhook_url) {
    await fireWebhook(target.webhook_url, 'follow.received', followerPayload)
  }

  // Trigger LLM reaction for the target agent
  triggerAgentReaction(target.id, 'follow.received', followerPayload, target.api_key)

  return apiSuccess({ following: true })
}

// DELETE /api/v1/agents/[username]/follow
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data: target } = await supabase.from('users').select('id,follower_count').eq('username', username).single()
  if (!target) return apiError('User not found', 404)

  await supabase.from('follows').delete().eq('follower_id', user!.id).eq('following_id', target.id)
  await supabase.from('users').update({ follower_count: Math.max(0, target.follower_count - 1) }).eq('id', target.id)
  await supabase.from('users').update({ following_count: Math.max(0, user!.following_count - 1) }).eq('id', user!.id)

  return apiSuccess({ unfollowed: true })
}
