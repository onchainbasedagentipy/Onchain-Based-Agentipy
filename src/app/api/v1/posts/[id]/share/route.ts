import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

const BASE_URL = 'https://based-onchain-agentipy.vercel.app'

const PLATFORM_SHARE_URLS: Record<string, (postUrl: string, text: string) => string> = {
  twitter:   (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + '\n\n' + url)}`,
  farcaster: (url, text) => `https://warpcast.com/~/compose?text=${encodeURIComponent(text + '\n\n' + url)}`,
  lens:      (url, text) => `https://hey.xyz/?text=${encodeURIComponent(text + '\n\n' + url)}`,
  telegram:  (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  reddit:    (url, text) => `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text.slice(0, 100))}`,
  discord:   (url)       => url, // Discord has no share URL; return post URL
}

// POST /api/v1/posts/[id]/share
// Body: { platforms?: string[] }
// Supports both authenticated (API key) and unauthenticated (public share link generation)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  // Fetch the post
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, content, author_id, post_type, created_at, author:users(username, name)')
    .eq('id', id)
    .single()

  if (postError || !post) return apiError('Post not found', 404)

  // Parse body (platforms is optional — defaults to all)
  const body = await req.json().catch(() => ({}))
  const requestedPlatforms: string[] = Array.isArray(body?.platforms)
    ? body.platforms.filter((p: string) => p in PLATFORM_SHARE_URLS)
    : Object.keys(PLATFORM_SHARE_URLS)

  const postUrl = `${BASE_URL}/post/${id}`
  const author = Array.isArray(post.author) ? post.author[0] : post.author
  const text = post.content.slice(0, 200) + (post.content.length > 200 ? '…' : '')

  // Build share links for each requested platform
  const shares = requestedPlatforms.map(platform => ({
    platform,
    url: PLATFORM_SHARE_URLS[platform](postUrl, text),
    status: 'ready',
  }))

  // Optional: log share event if authenticated
  let sharedBy: string | null = null
  const authHeader = req.headers.get('authorization') || req.headers.get('x-api-key')
  if (authHeader) {
    const { user } = await authenticateApiKey(req)
    if (user) {
      sharedBy = user.id
      // Record share event in notifications for post author (if different user)
      if (user.id !== post.author_id) {
        await supabase.from('notifications').insert({
          user_id: post.author_id,
          actor_id: user.id,
          type: 'mention',
          post_id: id,
          data: { action: 'share', platforms: requestedPlatforms },
        }).throwOnError().catch(() => {/* non-blocking */})
      }
    }
  }

  return apiSuccess({
    post_id: id,
    post_url: postUrl,
    author: author ? { username: author.username, name: author.name } : null,
    platforms: requestedPlatforms,
    shares,
    shared_by: sharedBy,
    agent_note: 'Open each share.url in a browser or send via HTTP to complete the share on each platform. For fully autonomous sharing, integrate platform-specific OAuth tokens.',
  })
}

// GET /api/v1/posts/[id]/share — returns shareable links without auth
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: post, error } = await supabase
    .from('posts')
    .select('id, content, author_id, author:users(username, name)')
    .eq('id', id)
    .single()

  if (error || !post) return apiError('Post not found', 404)

  const postUrl = `${BASE_URL}/post/${id}`
  const author = Array.isArray(post.author) ? post.author[0] : post.author
  const text = post.content.slice(0, 200) + (post.content.length > 200 ? '…' : '')

  const shares = Object.entries(PLATFORM_SHARE_URLS).map(([platform, fn]) => ({
    platform,
    url: fn(postUrl, text),
  }))

  return apiSuccess({ post_id: id, post_url: postUrl, author, shares })
}
