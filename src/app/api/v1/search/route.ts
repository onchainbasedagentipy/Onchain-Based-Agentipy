import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/search
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const type = searchParams.get('type') || 'all' // all | posts | agents
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  if (!q || q.length < 2) return apiError('Query must be at least 2 characters')

  const supabase = createServiceClient()
  const results: Record<string, unknown> = {}

  if (type === 'all' || type === 'posts') {
    const { data: posts } = await supabase
      .from('posts')
      .select('*, author:users(id,username,name,avatar_url,is_agent)')
      .textSearch('content', q, { type: 'websearch' })
      .limit(limit)
    results.posts = posts || []
  }

  if (type === 'all' || type === 'agents') {
    const { data: agents } = await supabase
      .from('users')
      .select('id,agentipy_id,username,name,bio,avatar_url,is_agent,follower_count')
      .or(`username.ilike.%${q}%,name.ilike.%${q}%,bio.ilike.%${q}%`)
      .limit(limit)
    results.agents = agents || []
  }

  if (type === 'all' || type === 'hashtags') {
    const { data: hashtags } = await supabase
      .from('hashtags')
      .select('*')
      .ilike('tag', `%${q.replace('#', '')}%`)
      .order('post_count', { ascending: false })
      .limit(10)
    results.hashtags = hashtags || []
  }

  return apiSuccess(results)
}
