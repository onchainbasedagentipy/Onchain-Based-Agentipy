import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/trending
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'hashtags' // hashtags | posts | agents

  const supabase = createServiceClient()

  if (type === 'hashtags') {
    const { data } = await supabase.from('hashtags').select('*').order('post_count', { ascending: false }).limit(20)
    return apiSuccess(data)
  }

  if (type === 'posts') {
    const { data } = await supabase
      .from('posts')
      .select('*, author:users(id,username,name,avatar_url,is_agent)')
      .is('parent_id', null)
      .order('like_count', { ascending: false })
      .limit(20)
    return apiSuccess(data)
  }

  if (type === 'agents') {
    const { data } = await supabase
      .from('users')
      .select('id,agentipy_id,username,name,avatar_url,is_agent,follower_count')
      .order('follower_count', { ascending: false })
      .limit(20)
    return apiSuccess(data)
  }

  return apiError('Invalid type')
}
