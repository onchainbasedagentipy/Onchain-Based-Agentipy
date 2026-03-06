'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Community, CommunityMessage } from '@/lib/types'
import { ArrowLeft, Send, Loader2, Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'
import { timeAgo } from '@/lib/utils-agentipy'
import { toast } from 'sonner'

export default function CommunityPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [messages, setMessages] = useState<CommunityMessage[]>([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isMember, setIsMember] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    const { data: comm } = await supabase.from('communities').select('*').eq('slug', slug).single()
    setCommunity(comm)

    if (comm) {
      const { data: msgs } = await supabase
        .from('community_messages')
        .select('*, author:users(*)')
        .eq('community_id', comm.id)
        .order('created_at', { ascending: true })
        .limit(100)
      setMessages(msgs || [])

      if (user) {
        const { data: membership } = await supabase.from('community_members').select('id').eq('community_id', comm.id).eq('user_id', user.id).single()
        setIsMember(!!membership)
      }
    }
    setLoading(false)
  }, [slug, user])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!community) return
    const sub = supabase.channel(`community-${community.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `community_id=eq.${community.id}` },
        async (payload) => {
          const { data } = await supabase.from('community_messages').select('*, author:users(*)').eq('id', payload.new.id).single()
          if (data) setMessages(m => [...m, data])
        }
      ).subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [community])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!user || !community || !msg.trim()) return
    if (!isMember) { toast.error('Join the community first'); return }
    setSending(true)
    const { error } = await supabase.from('community_messages').insert({
      community_id: community.id,
      author_id: user.id,
      content: msg.trim(),
    })
    if (!error) setMsg('')
    setSending(false)
  }

  const handleJoin = async () => {
    if (!user || !community) return
    await supabase.from('community_members').insert({ community_id: community.id, user_id: user.id })
    await supabase.from('communities').update({ member_count: community.member_count + 1 }).eq('id', community.id)
    setIsMember(true)
    toast.success('Joined!')
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
  if (!community) return <div className="text-center py-20 text-muted-foreground">Community not found</div>

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-screen">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold text-sm">{community.name}</h1>
          <p className="text-xs text-muted-foreground">{community.member_count} members</p>
        </div>
        {!isMember && (
          <button onClick={handleJoin} className="ml-auto agentipy-gradient text-white rounded-full px-4 py-1.5 text-sm font-semibold">
            Join
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(m => (
          <div key={m.id} className={`flex gap-2 ${(m.author as any)?.id === user?.id ? 'flex-row-reverse' : ''}`}>
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-secondary">
              {(m.author as any)?.avatar_url
                ? <Image src={(m.author as any).avatar_url} alt="" width={32} height={32} className="object-cover w-full h-full" />
                : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-xs font-bold text-white">{(m.author as any)?.name?.[0]}</div>
              }
            </div>
            <div className={`max-w-xs ${(m.author as any)?.id === user?.id ? 'items-end' : ''}`}>
              <p className="text-xs text-muted-foreground mb-0.5">{(m.author as any)?.username} · {timeAgo(m.created_at)}</p>
              <div className={`rounded-2xl px-3 py-2 text-sm ${(m.author as any)?.id === user?.id ? 'bg-primary text-white rounded-tr-none' : 'bg-secondary rounded-tl-none'}`}>
                {m.content}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3 pb-20 lg:pb-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={isMember ? 'Send a message...' : 'Join to send messages'}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            disabled={!isMember}
            className="flex-1 bg-secondary border border-border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!msg.trim() || sending || !isMember}
            className="agentipy-gradient text-white rounded-full p-2.5 hover:opacity-90 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
