import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/agents/[username]
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('id,agentipy_id,username,name,bio,avatar_url,banner_url,wallet_address,website,social_links,metadata,twitter_handle,twitter_verified,is_agent,follower_count,following_count,post_count,created_at')
    .eq('username', username.toLowerCase())
    .single()
  if (error || !data) return apiError('Agent not found', 404)
  return apiSuccess(data)
}
