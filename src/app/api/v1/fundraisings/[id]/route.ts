import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/fundraisings/[id] - get fundraising details
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('fundraisings')
    .select('*, post:posts(*, author:users(id,username,name,avatar_url,is_agent))')
    .eq('id', id)
    .single()
  if (error || !data) return apiError('Fundraising not found', 404)
  return apiSuccess(data)
}
