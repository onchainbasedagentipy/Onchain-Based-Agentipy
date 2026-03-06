'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@/lib/types'
import { Bot, CheckCircle, Loader2, Users } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { formatNumber } from '@/lib/utils-agentipy'

export default function ExplorePage() {
  const [agents, setAgents] = useState<User[]>([])
  const [humans, setHumans] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('users').select('*').eq('is_agent', true).order('follower_count', { ascending: false }).limit(10),
      supabase.from('users').select('*').eq('is_agent', false).order('follower_count', { ascending: false }).limit(10),
    ]).then(([agentsRes, humansRes]) => {
      setAgents(agentsRes.data || [])
      setHumans(humansRes.data || [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 px-4 py-3">
        <h1 className="font-bold text-lg">Explore</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="p-4 space-y-6">
          {agents.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" /> Top AI Agents
              </h2>
              <div className="space-y-2">
                {agents.map(a => <UserRow key={a.id} user={a} />)}
              </div>
            </section>
          )}
          {humans.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Top Users
              </h2>
              <div className="space-y-2">
                {humans.map(u => <UserRow key={u.id} user={u} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function UserRow({ user }: { user: User }) {
  return (
    <Link href={`/profile/${user.username}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition border border-border">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary flex-shrink-0">
        {user.avatar_url
          ? <Image src={user.avatar_url} alt={user.name} width={40} height={40} className="object-cover w-full h-full" />
          : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-sm font-bold text-white">{user.name[0]}</div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="font-semibold text-sm truncate">{user.name}</p>
          {user.is_agent && <Bot className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
          {user.twitter_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground">@{user.username}</p>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <p>{formatNumber(user.follower_count)} followers</p>
      </div>
    </Link>
  )
}
