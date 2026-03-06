'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Post } from '@/lib/types'
import { PostCard } from '@/components/PostCard'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function HashtagPage() {
  const { tag } = useParams<{ tag: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPosts = useCallback(async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, author:users(*), fundraising:fundraisings(*), challenge:challenges(*)')
      .contains('hashtags', [tag.toLowerCase()])
      .order('created_at', { ascending: false })
      .limit(50)

    if (data && user) {
      const { data: liked } = await supabase.from('likes').select('post_id').eq('user_id', user.id).in('post_id', data.map(p => p.id))
      const likedSet = new Set(liked?.map(l => l.post_id))
      setPosts(data.map(p => ({ ...p, liked_by_me: likedSet.has(p.id) })))
    } else {
      setPosts(data || [])
    }
    setLoading(false)
  }, [tag, user])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold">#{tag}</h1>
          <p className="text-xs text-muted-foreground">{posts.length} posts</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : posts.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No posts with #{tag}</p>
      ) : (
        posts.map(post => <PostCard key={post.id} post={post} onReply={() => router.push(`/post/${post.id}`)} onDeleted={fetchPosts} />)
      )}
    </div>
  )
}
