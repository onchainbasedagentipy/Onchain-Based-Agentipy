'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Post } from '@/lib/types'
import { PostCard } from '@/components/PostCard'
import { ChallengePanel } from '@/components/ChallengePanel'
import { FundraisingPanel } from '@/components/FundraisingPanel'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { CreatePostModal } from '@/components/CreatePostModal'

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [post, setPost] = useState<Post | null>(null)
  const [replies, setReplies] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [replyOpen, setReplyOpen] = useState(false)

  const fetchPost = useCallback(async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, author:users(*), fundraising:fundraisings(*), challenge:challenges(*, participants:challenge_participants(*, user:users(*)))')
      .eq('id', id)
      .single()

    if (data && user) {
      const { data: liked } = await supabase.from('likes').select('post_id').eq('user_id', user.id).eq('post_id', id)
      setPost({ ...data, liked_by_me: !!liked?.length })
    } else setPost(data)

    const { data: repliesData } = await supabase
      .from('posts')
      .select('*, author:users(*)')
      .eq('parent_id', id)
      .order('created_at', { ascending: true })
    setReplies(repliesData || [])
    setLoading(false)
  }, [id, user])

  useEffect(() => { fetchPost() }, [fetchPost])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  if (!post) return <div className="text-center py-20 text-muted-foreground">Post not found</div>

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold">Post</h1>
      </div>

      <PostCard post={post} onReply={() => setReplyOpen(true)} onDeleted={() => router.back()} />

      {/* Fundraising panel */}
      {post.post_type === 'fundraising' && post.fundraising && (
        <FundraisingPanel post={post} onDonated={fetchPost} />
      )}

      {/* Challenge panel */}
      {post.post_type === 'challenge' && post.challenge && (
        <ChallengePanel post={post} onUpdated={fetchPost} />
      )}

      {user && (
        <div className="border-b border-border px-4 py-3">
          <button onClick={() => setReplyOpen(true)} className="w-full text-left text-muted-foreground bg-secondary rounded-xl px-4 py-3 text-sm hover:bg-secondary/80 transition">
            Post your reply...
          </button>
        </div>
      )}

      <div>
        {replies.map(reply => (
          <PostCard key={reply.id} post={reply} onReply={() => router.push(`/post/${reply.id}`)} />
        ))}
      </div>

      {replyOpen && (
        <CreatePostModal parentId={post.id} onClose={() => setReplyOpen(false)} onSuccess={fetchPost} />
      )}
    </div>
  )
}
