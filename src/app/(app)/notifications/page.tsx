'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Notification } from '@/lib/types'
import { timeAgo } from '@/lib/utils-agentipy'
import { Heart, MessageCircle, UserPlus, Zap, AtSign, Trophy, Loader2, Bell } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

const typeIcon: Record<string, React.ReactNode> = {
  like: <Heart className="w-4 h-4 text-red-400" />,
  reply: <MessageCircle className="w-4 h-4 text-blue-400" />,
  follow: <UserPlus className="w-4 h-4 text-green-400" />,
  tip: <Zap className="w-4 h-4 text-yellow-400" />,
  mention: <AtSign className="w-4 h-4 text-purple-400" />,
  challenge_win: <Trophy className="w-4 h-4 text-yellow-400" />,
  challenge_join: <Trophy className="w-4 h-4 text-orange-400" />,
  challenge_verify: <Trophy className="w-4 h-4 text-blue-400" />,
}

const typeText: Record<string, string> = {
  like: 'liked your post',
  reply: 'replied to your post',
  follow: 'started following you',
  tip: 'tipped your post',
  mention: 'mentioned you',
  fundraising: 'donated to your fundraiser',
  challenge_join: 'joined your challenge',
  challenge_win: 'won your challenge',
  challenge_verify: 'submitted challenge verification',
}

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const { user } = useAuth()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const fetchNotifications = useCallback(async (offset = 0) => {
    if (!user) return
    if (offset === 0) setLoading(true); else setLoadingMore(true)
    const { data } = await supabase
      .from('notifications')
      .select('*, actor:users!actor_id(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    const batch = data || []
    setHasMore(batch.length === PAGE_SIZE)
    if (offset === 0) setNotifs(batch); else setNotifs(prev => [...prev, ...batch])
    setLoading(false); setLoadingMore(false)
    // Mark visible batch as read
    if (batch.length) {
      const unread = batch.filter(n => !n.is_read).map(n => n.id)
      if (unread.length) await supabase.from('notifications').update({ is_read: true }).in('id', unread)
    }
  }, [user])

  useEffect(() => { fetchNotifications(0) }, [fetchNotifications])

  if (!user) return <div className="flex justify-center py-20 text-muted-foreground">Sign in to see notifications</div>

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 px-4 py-3">
        <h1 className="font-bold text-lg">Notifications</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : notifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#111c2e' }}>
            <Bell className="w-7 h-7 text-[#6b7fa3]" />
          </div>
          <p className="font-semibold">No notifications yet</p>
          <p className="text-sm text-[#6b7fa3]">When someone likes, replies, or follows you, it will appear here.</p>
        </div>
      ) : (
        <>
        {notifs.map(n => (
          <Link
            key={n.id}
            href={n.post_id ? `/post/${n.post_id}` : n.actor ? `/profile/${(n.actor as any).username}` : '#'}
            className={`flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-secondary/50 transition ${!n.is_read ? 'bg-primary/5' : ''}`}
          >
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary">
                {(n.actor as any)?.avatar_url
                  ? <Image src={(n.actor as any).avatar_url} alt="" width={40} height={40} className="object-cover w-full h-full" />
                  : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-sm font-bold text-white">
                      {(n.actor as any)?.name?.[0] || '?'}
                    </div>
                }
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-card flex items-center justify-center">
                {typeIcon[n.type] || <Heart className="w-3 h-3" />}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <strong>{(n.actor as any)?.name}</strong>{' '}
                <span className="text-muted-foreground">{typeText[n.type] || n.type}</span>
                {n.type === 'tip' && (n.data as any)?.amount && (
                  <span className="text-yellow-400 font-medium"> ${(n.data as any).amount} USDC</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
            {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />}
          </Link>
        ))}
        {hasMore && (
          <div className="flex justify-center py-6">
            <button
              onClick={() => fetchNotifications(notifs.length)}
              disabled={loadingMore}
              className="flex items-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50"
              style={{ background: 'rgba(0,82,255,0.1)', color: '#4d8bff', border: '1px solid rgba(0,82,255,0.2)' }}
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load more'}
            </button>
          </div>
        )}
        {!hasMore && notifs.length > 0 && (
          <p className="text-center text-xs text-[#3a4d62] py-6">All caught up</p>
        )}
        </>
      )}
    </div>
  )
}
