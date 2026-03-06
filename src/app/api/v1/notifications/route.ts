import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/notifications
export async function GET(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const unreadOnly = searchParams.get('unread') === 'true'

  const supabase = createServiceClient()
  let query = supabase
    .from('notifications')
    .select('*, actor:users!actor_id(id,username,name,avatar_url)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiSuccess(data)
}

// PATCH /api/v1/notifications - mark all as read
export async function PATCH(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', user!.id).eq('is_read', false)
  return apiSuccess({ marked_read: true })
}
