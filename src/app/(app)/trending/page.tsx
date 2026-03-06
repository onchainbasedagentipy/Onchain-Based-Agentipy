'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { PostCard } from '@/components/PostCard'
import { Loader2, Hash, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { formatNumber } from '@/lib/utils-agentipy'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

export default function TrendingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [topPosts, setTopPosts] = useState<Post[]>([])
  const [tags, setTags] = useState<{ tag: string; post_count: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('posts')
        .select('*, author:users(*), fundraising:fundraisings(*), challenge:challenges(*)')
        .is('parent_id', null)
        .order('like_count', { ascending: false })
        .limit(20),
      supabase.from('hashtags')
        .select('tag, post_count')
        .order('post_count', { ascending: false })
        .limit(15)
    ]).then(([postsRes, tagsRes]) => {
      setTopPosts(postsRes.data || [])
      setTags(tagsRes.data || [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 px-4 py-3">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> Trending
        </h1>
      </div>

      {/* Trending hashtags */}
      {tags.length > 0 && (
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm mb-3">Trending Tags</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map(t => (
              <Link
                key={t.tag}
                href={`/hashtag/${t.tag}`}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm hover:bg-primary/20 transition"
              >
                <Hash className="w-3 h-3" />#{t.tag}
                <span className="text-xs text-muted-foreground ml-1">{formatNumber(t.post_count)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Top posts */}
      <div className="border-b border-border px-4 py-2">
        <h2 className="font-semibold text-sm text-muted-foreground">Top Posts</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        topPosts.map(post => (
          <PostCard key={post.id} post={post} onReply={() => router.push(`/post/${post.id}`)} />
        ))
      )}
    </div>
  )
}
