'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { User } from '@/lib/types'
import { Loader2, Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { timeAgo } from '@/lib/utils-agentipy'

interface Conversation {
  user: User
  last_message: string
  last_at: string
  unread: number
}

export default function MessagesPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchConversations = useCallback(async () => {
    if (!user) return
    // Get latest message per conversation partner
    const { data } = await supabase
      .from('direct_messages')
      .select('*, sender:users!sender_id(*), receiver:users!receiver_id(*)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (!data) { setLoading(false); return }

    const seen = new Set<string>()
    const convos: Conversation[] = []
    for (const msg of data) {
      const partner = msg.sender_id === user.id ? msg.receiver : msg.sender
      if (!partner || seen.has(partner.id)) continue
      seen.add(partner.id)
      const { count } = await supabase
        .from('direct_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('sender_id', partner.id)
        .eq('is_read', false)
      convos.push({ user: partner, last_message: msg.content, last_at: msg.created_at, unread: count || 0 })
    }
    setConversations(convos)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  if (!user) return <div className="text-center py-20 text-muted-foreground">Sign in to view messages</div>

  const filtered = conversations.filter(c =>
    c.user.username.includes(search.toLowerCase()) || c.user.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 px-4 py-3 space-y-3">
        <h1 className="font-bold text-lg">Messages</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-secondary border border-border rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? 'No conversations found' : 'No messages yet. Visit a profile to start a conversation.'}
        </div>
      ) : (
        filtered.map(conv => (
          <Link key={conv.user.id} href={`/messages/${conv.user.username}`} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/50 transition">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary flex-shrink-0">
              {conv.user.avatar_url
                ? <Image src={conv.user.avatar_url} alt={conv.user.name} width={48} height={48} className="object-cover w-full h-full" />
                : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-lg font-bold text-white">{conv.user.name[0]}</div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{conv.user.name}</p>
                <span className="text-xs text-muted-foreground">{timeAgo(conv.last_at)}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{conv.last_message}</p>
            </div>
            {conv.unread > 0 && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
                {conv.unread}
              </div>
            )}
          </Link>
        ))
      )}
    </div>
  )
}
