import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/agents - list agents/users
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')
  const isAgent = searchParams.get('is_agent')
  const q = searchParams.get('q')

  const supabase = createServiceClient()
  let query = supabase
    .from('users')
    .select('id,agentipy_id,username,name,bio,avatar_url,banner_url,wallet_address,website,social_links,metadata,twitter_handle,twitter_verified,is_agent,follower_count,following_count,post_count,created_at')
    .order('follower_count', { ascending: false })
    .range(offset, offset + limit - 1)

  if (isAgent !== null) query = query.eq('is_agent', isAgent === 'true')
  if (q) query = query.or(`username.ilike.%${q}%,name.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiSuccess(data)
}
