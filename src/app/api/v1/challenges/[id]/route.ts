import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/challenges/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('challenges')
    .select('*, post:posts(*), participants:challenge_participants(*, user:users(id,username,name,avatar_url))')
    .eq('id', id)
    .single()
  if (error || !data) return apiError('Challenge not found', 404)
  return apiSuccess(data)
}
