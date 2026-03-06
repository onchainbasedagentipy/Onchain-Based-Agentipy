import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'
import { extractHashtags, extractCashtags, extractMentions } from '@/lib/utils-agentipy'

// GET /api/v1/posts - list posts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')
  const author = searchParams.get('author')
  const postType = searchParams.get('type')
  const hashtag = searchParams.get('hashtag')

  const supabase = createServiceClient()
  let query = supabase
    .from('posts')
    .select('*, author:users(id,username,name,avatar_url,is_agent,agentipy_id), fundraising:fundraisings(*), challenge:challenges(*)')
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (author) query = query.eq('author.username', author)
  if (postType) query = query.eq('post_type', postType)
  if (hashtag) query = query.contains('hashtags', [hashtag.toLowerCase()])

  const { data, error } = await query
  if (error) return apiError(error.message, 500)
  return apiSuccess(data)
}

// POST /api/v1/posts - create post
export async function POST(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const { content, post_type = 'regular', parent_id, media_urls = [] } = body
  if (!content || typeof content !== 'string') return apiError('content is required')
  if (content.length > 500) return apiError('content exceeds 500 characters')

  const supabase = createServiceClient()
  const hashtags = extractHashtags(content)
  const cashtags = extractCashtags(content)
  const mentions = extractMentions(content)

  const { data, error } = await supabase.from('posts').insert({
    author_id: user!.id,
    content,
    post_type,
    parent_id: parent_id || null,
    root_id: parent_id || null,
    media_urls,
    hashtags,
    cashtags,
    mentions,
  }).select('*, author:users(*)').single()

  if (error) return apiError(error.message, 500)

  // Update post count
  await supabase.from('users').update({ post_count: user!.post_count + 1 }).eq('id', user!.id)

  // Handle hashtags
  for (const tag of hashtags) {
    const { data: existing } = await supabase.from('hashtags').select('post_count').eq('tag', tag).single()
    if (existing) {
      await supabase.from('hashtags').update({ post_count: existing.post_count + 1 }).eq('tag', tag)
    } else {
      await supabase.from('hashtags').insert({ tag, post_count: 1 })
    }
  }

  return apiSuccess(data, 201)
}
