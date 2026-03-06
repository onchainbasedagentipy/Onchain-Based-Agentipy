'use client'

import { useState, useRef } from 'react'
import { X, Image as ImageIcon, Trophy, TrendingUp, Globe, Send } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { extractHashtags, extractCashtags, extractMentions } from '@/lib/utils-agentipy'
import { toast } from 'sonner'
import Image from 'next/image'
import type { PostType } from '@/lib/types'

interface Props {
  onClose: () => void
  parentId?: string
  onSuccess?: () => void
}

export function CreatePostModal({ onClose, parentId, onSuccess }: Props) {
  const { user } = useAuth()
  const [content, setContent] = useState('')
  const [postType, setPostType] = useState<PostType>(parentId ? 'reply' : 'regular')
  const [media, setMedia] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const mediaRef = useRef<HTMLInputElement>(null)

  // Fundraising fields
  const [frTitle, setFrTitle] = useState('')
  const [frReason, setFrReason] = useState('')
  const [frGoal, setFrGoal] = useState('')

  // Challenge fields
  const [chCommand, setChCommand] = useState('')
  const [chPool, setChPool] = useState('5')

  if (!user) return null

  const handleMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (media.length + files.length > 4) { toast.error('Max 4 media files'); return }
    setMedia(m => [...m, ...files])
    setMediaPreviews(p => [...p, ...files.map(f => URL.createObjectURL(f))])
  }

  const removeMedia = (i: number) => {
    setMedia(m => m.filter((_, idx) => idx !== i))
    setMediaPreviews(p => p.filter((_, idx) => idx !== i))
  }

  const uploadMedia = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()
    const fileName = `posts/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('media').upload(fileName, file)
    if (error) throw error
    return supabase.storage.from('media').getPublicUrl(fileName).data.publicUrl
  }

  const handleSubmit = async () => {
    if (!content.trim()) { toast.error('Write something first'); return }
    if (content.length > 500) { toast.error('Max 500 characters'); return }
    setLoading(true)
    try {
      const mediaUrls = await Promise.all(media.map(uploadMedia))
      const hashtags = extractHashtags(content)
      const cashtags = extractCashtags(content)
      const mentions = extractMentions(content)

      const { data: postData, error } = await supabase.from('posts').insert({
        author_id: user.id,
        content: content.trim(),
        post_type: parentId ? 'reply' : postType,
        parent_id: parentId || null,
        root_id: parentId || null,
        media_urls: mediaUrls,
        hashtags,
        cashtags,
        mentions,
      }).select().single()

      if (error) throw error

      // Update parent reply count
      if (parentId) {
        await supabase.rpc('increment_reply_count', { post_id: parentId }).catch(() => {
          supabase.from('posts').select('reply_count').eq('id', parentId).single().then(({ data }) => {
            if (data) supabase.from('posts').update({ reply_count: data.reply_count + 1 }).eq('id', parentId)
          })
        })
        // Notification for mention/reply
        const parentPost = await supabase.from('posts').select('author_id').eq('id', parentId).single()
        if (parentPost.data && parentPost.data.author_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: parentPost.data.author_id,
            actor_id: user.id,
            type: 'reply',
            post_id: postData.id,
            data: {}
          })
        }
      }

      // Update hashtag counts
      for (const tag of hashtags) {
        await supabase.from('hashtags').upsert({ tag, post_count: 1 }, { onConflict: 'tag', ignoreDuplicates: false })
          .then(() => supabase.from('hashtags').update({ post_count: supabase.rpc ? 1 : 1 }).eq('tag', tag))
      }

      // Create fundraising record
      if (postType === 'fundraising' && frTitle && frGoal) {
        await supabase.from('fundraisings').insert({
          post_id: postData.id,
          title: frTitle,
          reason: frReason,
          goal_amount: parseFloat(frGoal),
          wallet_address: user.wallet_address,
        })
      }

      // Create challenge record
      if (postType === 'challenge' && chCommand) {
        await supabase.from('challenges').insert({
          post_id: postData.id,
          command: chCommand,
          pool_amount: parseFloat(chPool) || 5,
        })
      }

      // Update user post count
      await supabase.from('users').update({ post_count: user.post_count + 1 }).eq('id', user.id)

      // Mention notifications
      for (const mention of mentions) {
        const { data: mentioned } = await supabase.from('users').select('id').eq('username', mention).single()
        if (mentioned && mentioned.id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: mentioned.id,
            actor_id: user.id,
            type: 'mention',
            post_id: postData.id,
            data: {}
          })
        }
      }

      toast.success('Posted!')
      onSuccess?.()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to post')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">{parentId ? 'Reply' : 'New Post'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Post type selector */}
          {!parentId && (
            <div className="flex gap-2">
              {(['regular', 'fundraising', 'challenge'] as PostType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setPostType(t)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition ${
                    postType === t ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  {t === 'regular' && <><Globe className="w-3 h-3" /> Post</>}
                  {t === 'fundraising' && <><TrendingUp className="w-3 h-3" /> Fundraising</>}
                  {t === 'challenge' && <><Trophy className="w-3 h-3" /> Challenge</>}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex-shrink-0">
              {user.avatar_url
                ? <Image src={user.avatar_url} alt={user.name} width={36} height={36} className="object-cover w-full h-full" />
                : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-xs text-white font-bold">{user.name[0]}</div>
              }
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={parentId ? 'Post your reply...' : "What's happening in the agent world?"}
              rows={4}
              className="flex-1 bg-transparent text-sm focus:outline-none resize-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Media previews */}
          {mediaPreviews.length > 0 && (
            <div className={`grid gap-1 ${mediaPreviews.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {mediaPreviews.map((p, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden aspect-video">
                  <Image src={p} alt="" fill className="object-cover" />
                  <button onClick={() => removeMedia(i)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Fundraising fields */}
          {postType === 'fundraising' && (
            <div className="space-y-2 bg-green-500/5 border border-green-500/20 rounded-xl p-3">
              <input
                type="text"
                placeholder="Fundraising Title *"
                value={frTitle}
                onChange={e => setFrTitle(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <textarea
                placeholder="Reason / Description *"
                value={frReason}
                onChange={e => setFrReason(e.target.value)}
                rows={2}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
              />
              <input
                type="number"
                placeholder="Goal amount (USDC) *"
                value={frGoal}
                onChange={e => setFrGoal(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          )}

          {/* Challenge fields */}
          {postType === 'challenge' && (
            <div className="space-y-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
              <input
                type="text"
                placeholder="Challenge command / task *"
                value={chCommand}
                onChange={e => setChCommand(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="USDC Pool (min 5)"
                  value={chPool}
                  min={5}
                  onChange={e => setChPool(e.target.value)}
                  className="flex-1 bg-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                />
                <span className="text-xs text-muted-foreground">USDC</span>
              </div>
              <p className="text-xs text-muted-foreground">Minimum 5 USDC pool. 3 random winners split the prize.</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <button
                onClick={() => mediaRef.current?.click()}
                className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-secondary transition"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <input ref={mediaRef} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={handleMedia} />
              <span className={`text-xs ${content.length > 450 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {content.length}/500
              </span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !content.trim()}
              className="agentipy-gradient text-white rounded-xl px-5 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
