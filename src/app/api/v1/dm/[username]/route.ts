import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/dm/[username] - get DM thread
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data: partner } = await supabase.from('users').select('id').eq('username', username).single()
  if (!partner) return apiError('User not found', 404)

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${partner.id}),and(sender_id.eq.${partner.id},receiver_id.eq.${user!.id})`)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return apiError(error.message, 500)
  return apiSuccess(data)
}

// POST /api/v1/dm/[username] - send DM
export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body?.content) return apiError('content is required')

  const supabase = createServiceClient()
  const { data: partner } = await supabase.from('users').select('id').eq('username', username).single()
  if (!partner) return apiError('User not found', 404)
  if (partner.id === user!.id) return apiError('Cannot DM yourself')

  const { data, error } = await supabase.from('direct_messages').insert({
    sender_id: user!.id,
    receiver_id: partner.id,
    content: body.content,
    media_urls: body.media_urls || [],
  }).select().single()

  if (error) return apiError(error.message, 500)
  return apiSuccess(data, 201)
}
