'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Community } from '@/lib/types'
import { Loader2, Users, Plus, Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { formatNumber } from '@/lib/utils-agentipy'
import { toast } from 'sonner'
import { CreateCommunityModal } from '@/components/CreateCommunityModal'

export default function CommunitiesPage() {
  const { user } = useAuth()
  const [communities, setCommunities] = useState<Community[]>([])
  const [myComms, setMyComms] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')

  const fetchCommunities = useCallback(async () => {
    const query = supabase.from('communities').select('*, owner:users!owner_id(*)').eq('is_public', true)
    if (search) {
      query.ilike('name', `%${search}%`)
    }
    const { data } = await query.order('member_count', { ascending: false }).limit(30)
    setCommunities(data || [])

    if (user) {
      const { data: memberships } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', user.id)
      const ids = memberships?.map(m => m.community_id) || []
      if (ids.length) {
        const { data: myC } = await supabase.from('communities').select('*, owner:users!owner_id(*)').in('id', ids)
        setMyComms(myC || [])
      }
    }
    setLoading(false)
  }, [user, search])

  useEffect(() => { fetchCommunities() }, [fetchCommunities])

  const handleJoin = async (comm: Community) => {
    if (!user) { toast.error('Sign in to join'); return }
    const { error } = await supabase.from('community_members').insert({ community_id: comm.id, user_id: user.id })
    if (!error) {
      await supabase.from('communities').update({ member_count: comm.member_count + 1 }).eq('id', comm.id)
      toast.success(`Joined ${comm.name}!`)
      fetchCommunities()
    }
  }

  const shown = tab === 'all' ? communities : myComms

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-lg">Communities</h1>
          {user && (
            <button onClick={() => setCreateOpen(true)} className="agentipy-gradient text-white rounded-full p-2">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search communities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-secondary border border-border rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'mine'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition capitalize ${
                tab === t ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'
              }`}
            >
              {t === 'all' ? 'Discover' : 'My Communities'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {tab === 'mine' ? 'You have not joined any communities yet' : 'No communities found'}
        </div>
      ) : (
        <div className="p-4 grid gap-3">
          {shown.map(comm => (
            <CommunityCard key={comm.id} community={comm} onJoin={() => handleJoin(comm)} isJoined={myComms.some(m => m.id === comm.id)} />
          ))}
        </div>
      )}

      {createOpen && <CreateCommunityModal onClose={() => setCreateOpen(false)} onSuccess={fetchCommunities} />}
    </div>
  )
}

function CommunityCard({ community, onJoin, isJoined }: { community: Community; onJoin: () => void; isJoined: boolean }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="h-20 bg-gradient-to-br from-purple-900/40 to-pink-900/20 relative">
        {community.banner_url && <Image src={community.banner_url} alt="" fill className="object-cover" />}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{community.name}</h3>
            {community.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{community.description}</p>}
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> {formatNumber(community.member_count)} members
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {isJoined ? (
              <Link href={`/communities/${community.slug}`} className="border border-border rounded-full px-4 py-1.5 text-sm font-medium hover:bg-secondary transition">
                Open
              </Link>
            ) : (
              <button onClick={onJoin} className="agentipy-gradient text-white rounded-full px-4 py-1.5 text-sm font-semibold hover:opacity-90 transition">
                Join
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
