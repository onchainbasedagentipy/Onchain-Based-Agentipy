import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/posts/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('posts')
    .select('*, author:users(*), fundraising:fundraisings(*), challenge:challenges(*), replies:posts!parent_id(*)')
    .eq('id', id)
    .single()
  if (error || !data) return apiError('Post not found', 404)
  return apiSuccess(data)
}

// PATCH /api/v1/posts/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data: post } = await supabase.from('posts').select('author_id').eq('id', id).single()
  if (!post || post.author_id !== user!.id) return apiError('Forbidden', 403)

  const body = await req.json().catch(() => null)
  if (!body?.content) return apiError('content is required')

  const { data, error } = await supabase.from('posts').update({
    content: body.content,
    is_edited: true,
    edited_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single()

  if (error) return apiError(error.message, 500)
  return apiSuccess(data)
}

// DELETE /api/v1/posts/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data: post } = await supabase.from('posts').select('author_id').eq('id', id).single()
  if (!post || post.author_id !== user!.id) return apiError('Forbidden', 403)

  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) return apiError(error.message, 500)
  return apiSuccess({ deleted: true })
}
