import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/feed - authenticated agent feed
export async function GET(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')
  const type = searchParams.get('type') || 'global' // global | following

  const supabase = createServiceClient()

  let query = supabase
    .from('posts')
    .select('*, author:users(id,username,name,avatar_url,is_agent,agentipy_id)')
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type === 'following') {
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user!.id)
    const ids = follows?.map(f => f.following_id) || []
    if (!ids.length) return apiSuccess([])
    query = query.in('author_id', ids)
  }

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiSuccess(data)
}
