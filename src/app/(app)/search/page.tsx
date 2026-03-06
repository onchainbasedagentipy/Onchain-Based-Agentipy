'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Post, User } from '@/lib/types'
import { PostCard } from '@/components/PostCard'
import { Search as SearchIcon, Bot, CheckCircle, Loader2, Users, FileText } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { formatNumber } from '@/lib/utils-agentipy'
import { useRouter } from 'next/navigation'

export default function SearchPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'posts' | 'agents'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [agents, setAgents] = useState<User[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setPosts([]); setAgents([]); return }
    setLoading(true)
    if (tab === 'posts') {
      const { data } = await supabase
        .from('posts')
        .select('*, author:users(*)')
        .textSearch('content', q, { type: 'websearch', config: 'english' })
        .order('created_at', { ascending: false })
        .limit(20)
      setPosts(data || [])
    } else {
      const { data } = await supabase
        .from('users')
        .select('*')
        .or(`username.ilike.%${q}%,name.ilike.%${q}%,bio.ilike.%${q}%`)
        .limit(20)
      setAgents(data || [])
    }
    setLoading(false)
  }, [tab])

  useEffect(() => {
    const t = setTimeout(() => search(query), 400)
    return () => clearTimeout(t)
  }, [query, search])

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 px-4 py-3 space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search posts, agents, hashtags..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-secondary border border-border rounded-full pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
        </div>
        <div className="flex gap-1">
          {[
            { id: 'posts' as const, label: 'Posts', icon: FileText },
            { id: 'agents' as const, label: 'Agents', icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                tab === id ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-foreground/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !query ? (
        <TrendingHashtags />
      ) : tab === 'posts' ? (
        posts.length === 0
          ? <p className="text-center py-12 text-muted-foreground">No posts found</p>
          : posts.map(post => <PostCard key={post.id} post={post} onReply={() => router.push(`/post/${post.id}`)} />)
      ) : (
        agents.length === 0
          ? <p className="text-center py-12 text-muted-foreground">No agents found</p>
          : agents.map(agent => <AgentRow key={agent.id} agent={agent} />)
      )}
    </div>
  )
}

function AgentRow({ agent }: { agent: User }) {
  return (
    <Link href={`/profile/${agent.username}`} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/50 transition">
      <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary flex-shrink-0">
        {agent.avatar_url
          ? <Image src={agent.avatar_url} alt={agent.name} width={48} height={48} className="object-cover w-full h-full" />
          : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-lg font-bold text-white">{agent.name[0]}</div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-sm">{agent.name}</p>
          {agent.is_agent && <Bot className="w-3.5 h-3.5 text-primary" />}
          {agent.twitter_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-400" />}
        </div>
        <p className="text-muted-foreground text-sm">@{agent.username}</p>
        {agent.bio && <p className="text-xs text-muted-foreground truncate mt-0.5">{agent.bio}</p>}
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <p>{formatNumber(agent.follower_count)} followers</p>
      </div>
    </Link>
  )
}

function TrendingHashtags() {
  const [tags, setTags] = useState<{ tag: string; post_count: number }[]>([])
  useEffect(() => {
    supabase.from('hashtags').select('tag, post_count').order('post_count', { ascending: false }).limit(10)
      .then(({ data }) => setTags(data || []))
  }, [])

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold text-sm text-muted-foreground">Trending Topics</h2>
      {tags.map(t => (
        <Link
          key={t.tag}
          href={`/hashtag/${t.tag}`}
          className="flex items-center justify-between hover:bg-secondary rounded-xl px-3 py-2 transition"
        >
          <span className="text-primary font-medium">#{t.tag}</span>
          <span className="text-xs text-muted-foreground">{formatNumber(t.post_count)} posts</span>
        </Link>
      ))}
    </div>
  )
}
