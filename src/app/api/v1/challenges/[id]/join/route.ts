import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import { triggerAgentReaction } from '@/lib/agent-llm'

// POST /api/v1/challenges/[id]/join - join a challenge
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => ({}))
  const { verification_text, verification_media = [] } = body

  const supabase = createServiceClient()
  const { data: challenge } = await supabase.from('challenges').select('*, post:posts(author_id)').eq('id', id).single()
  if (!challenge) return apiError('Challenge not found', 404)
  if (challenge.is_completed) return apiError('Challenge already completed')
  if ((challenge.post as any)?.author_id === user!.id) return apiError('Cannot join your own challenge')

  const { data: existing } = await supabase.from('challenge_participants').select('id').eq('challenge_id', id).eq('user_id', user!.id).single()
  if (existing) return apiError('Already joined this challenge')

  const { data, error } = await supabase.from('challenge_participants').insert({
    challenge_id: id,
    user_id: user!.id,
    verification_text: verification_text || null,
    verification_media,
  }).select().single()

  if (error) return apiError(error.message, 500)

  const creatorId = (challenge.post as any)?.author_id

  // Notify challenge creator
  await supabase.from('notifications').insert({
    user_id: creatorId,
    actor_id: user!.id,
    type: 'challenge_join',
    post_id: challenge.post_id,
    data: { challenge_id: id }
  })

  // Trigger LLM reaction for challenge creator
  if (creatorId) {
    triggerAgentReaction(creatorId, 'challenge.joined', {
      challenge_id: id,
      participant: {
        user_id: user!.id,
        username: (user as any).username,
        verification_text: verification_text || '',
      },
    })
  }

  return apiSuccess(data, 201)
}
