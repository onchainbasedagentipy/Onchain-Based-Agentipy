'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { DirectMessage, User } from '@/lib/types'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { timeAgo } from '@/lib/utils-agentipy'
import Link from 'next/link'

export default function DMPage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [partner, setPartner] = useState<User | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    if (!user) return
    const { data: p } = await supabase.from('users').select('*').eq('username', username).single()
    setPartner(p)

    if (p) {
      const { data: msgs } = await supabase
        .from('direct_messages')
        .select('*, sender:users!sender_id(*)')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${p.id}),and(sender_id.eq.${p.id},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(100)
      setMessages(msgs || [])

      // Mark as read
      await supabase.from('direct_messages').update({ is_read: true }).eq('sender_id', p.id).eq('receiver_id', user.id).eq('is_read', false)
    }
    setLoading(false)
  }, [username, user])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!user || !partner) return
    const sub = supabase.channel(`dm-${[user.id, partner.id].sort().join('-')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        async (payload) => {
          const row = payload.new as DirectMessage
          if ((row.sender_id === user.id && row.receiver_id === partner.id) ||
              (row.sender_id === partner.id && row.receiver_id === user.id)) {
            const { data } = await supabase.from('direct_messages').select('*, sender:users!sender_id(*)').eq('id', row.id).single()
            if (data) {
              setMessages(m => [...m, data])
              if (row.receiver_id === user.id) {
                await supabase.from('direct_messages').update({ is_read: true }).eq('id', row.id)
              }
            }
          }
        }
      ).subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [user, partner])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!user || !partner || !msg.trim()) return
    setSending(true)
    await supabase.from('direct_messages').insert({
      sender_id: user.id,
      receiver_id: partner.id,
      content: msg.trim(),
    })
    setMsg('')
    setSending(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
  if (!partner) return <div className="text-center py-20 text-muted-foreground">User not found</div>

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-screen">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Link href={`/profile/${partner.username}`} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary">
            {partner.avatar_url
              ? <Image src={partner.avatar_url} alt={partner.name} width={32} height={32} className="object-cover w-full h-full" />
              : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-xs font-bold text-white">{partner.name[0]}</div>
            }
          </div>
          <div>
            <p className="font-semibold text-sm">{partner.name}</p>
            <p className="text-xs text-muted-foreground">@{partner.username}</p>
          </div>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-4">
        {messages.map(m => {
          const isMine = m.sender_id === user?.id
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2 text-sm ${isMine ? 'bg-primary text-white rounded-br-none' : 'bg-secondary rounded-bl-none'}`}>
                <p>{m.content}</p>
                <p className={`text-xs mt-1 ${isMine ? 'text-white/60' : 'text-muted-foreground'}`}>{timeAgo(m.created_at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-4 py-3 pb-20 lg:pb-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Send a message..."
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            className="flex-1 bg-secondary border border-border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={sendMessage}
            disabled={!msg.trim() || sending}
            className="agentipy-gradient text-white rounded-full p-2.5 hover:opacity-90 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
