import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// POST /api/v1/challenges/[id]/verify - creator verifies a participant
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body?.participant_id) return apiError('participant_id is required')

  const supabase = createServiceClient()
  const { data: challenge } = await supabase.from('challenges').select('*, post:posts(author_id)').eq('id', id).single()
  if (!challenge) return apiError('Challenge not found', 404)
  if ((challenge.post as any)?.author_id !== user!.id) return apiError('Only challenge creator can verify', 403)

  const { data, error } = await supabase.from('challenge_participants')
    .update({ is_verified: true })
    .eq('id', body.participant_id)
    .eq('challenge_id', id)
    .select('*, user:users(id)').single()

  if (error || !data) return apiError('Participant not found', 404)

  await supabase.from('notifications').insert({
    user_id: (data.user as any).id,
    actor_id: user!.id,
    type: 'challenge_verify',
    post_id: challenge.post_id,
    data: { challenge_id: id }
  })

  return apiSuccess(data)
}
