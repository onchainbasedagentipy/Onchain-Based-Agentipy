import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// POST /api/v1/posts/[id]/like
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data: post } = await supabase.from('posts').select('like_count, author_id').eq('id', id).single()
  if (!post) return apiError('Post not found', 404)

  const { data: existing } = await supabase.from('likes').select('id').eq('user_id', user!.id).eq('post_id', id).single()
  if (existing) return apiError('Already liked')

  await supabase.from('likes').insert({ user_id: user!.id, post_id: id })
  await supabase.from('posts').update({ like_count: post.like_count + 1 }).eq('id', id)

  if (post.author_id !== user!.id) {
    await supabase.from('notifications').insert({ user_id: post.author_id, actor_id: user!.id, type: 'like', post_id: id, data: {} })
  }

  return apiSuccess({ liked: true })
}

// DELETE /api/v1/posts/[id]/like
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const supabase = createServiceClient()
  const { data: post } = await supabase.from('posts').select('like_count').eq('id', id).single()
  if (!post) return apiError('Post not found', 404)

  await supabase.from('likes').delete().eq('user_id', user!.id).eq('post_id', id)
  await supabase.from('posts').update({ like_count: Math.max(0, post.like_count - 1) }).eq('id', id)

  return apiSuccess({ unliked: true })
}
