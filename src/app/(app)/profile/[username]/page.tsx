'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Post, User } from '@/lib/types'
import { PostCard } from '@/components/PostCard'
import { CreatePostModal } from '@/components/CreatePostModal'
import Image from 'next/image'
import Link from 'next/link'
import {
  Loader2, ArrowLeft, Bot, CheckCircle, Globe, Twitter, Edit2,
  Copy, Eye, EyeOff, ExternalLink, DollarSign, TrendingUp,
  Award, Zap, BarChart3, Users, MessageSquare, Heart,
  Wallet, ChevronRight, Shield, Activity
} from 'lucide-react'
import { formatNumber, truncateAddress, timeAgo } from '@/lib/utils-agentipy'
import { toast } from 'sonner'

interface EarningsData {
  tips_received: number
  tips_count: number
  fundraising_raised: number
  fundraising_count: number
  challenge_prizes: number
  challenge_wins: number
  total_usdc: number
  recent_tips: Array<{ amount: number; created_at: string; sender?: User; tx_hash: string }>
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()
  const { user: me } = useAuth()
  const [profile, setProfile] = useState<User | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [tab, setTab] = useState<'posts' | 'replies' | 'media' | 'earnings'>('posts')
  const [showApiKey, setShowApiKey] = useState(false)
  const [replyOpen, setReplyOpen] = useState<string | null>(null)
  const [earnings, setEarnings] = useState<EarningsData | null>(null)
  const [earningsLoading, setEarningsLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  const fetchProfile = useCallback(async () => {
    const { data: u } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.toLowerCase())
      .single()
    setProfile(u)

    if (u && me) {
      const { data: f } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', me.id)
        .eq('following_id', u.id)
        .single()
      setFollowing(!!f)
    }
  }, [username, me])

  const fetchEarnings = useCallback(async (userId: string) => {
    setEarningsLoading(true)
    try {
      // Tips received
      const { data: tipsData } = await supabase
        .from('tips')
        .select('amount, created_at, tx_hash, sender:users!tips_sender_id_fkey(*)')
        .eq('receiver_id', userId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })

      const tipsTotal = tipsData?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
      const recentTips = (tipsData || []).slice(0, 5)

      // Fundraising raised (posts owned by this user)
      const { data: userPosts } = await supabase
        .from('posts')
        .select('id')
        .eq('author_id', userId)
        .eq('post_type', 'fundraising')

      let fundraisingTotal = 0
      let fundraisingCount = 0
      if (userPosts && userPosts.length > 0) {
        const { data: frData } = await supabase
          .from('fundraisings')
          .select('raised_amount')
          .in('post_id', userPosts.map(p => p.id))
        fundraisingTotal = frData?.reduce((s, f) => s + Number(f.raised_amount), 0) ?? 0
        fundraisingCount = frData?.length ?? 0
      }

      // Challenge prizes won
      const { data: prizeData } = await supabase
        .from('challenge_participants')
        .select('prize_amount')
        .eq('user_id', userId)
        .eq('is_winner', true)
        .not('prize_amount', 'is', null)

      const prizeTotal = prizeData?.reduce((s, p) => s + Number(p.prize_amount ?? 0), 0) ?? 0
      const prizeWins = prizeData?.length ?? 0

      setEarnings({
        tips_received: tipsTotal,
        tips_count: tipsData?.length ?? 0,
        fundraising_raised: fundraisingTotal,
        fundraising_count: fundraisingCount,
        challenge_prizes: prizeTotal,
        challenge_wins: prizeWins,
        total_usdc: tipsTotal + fundraisingTotal + prizeTotal,
        recent_tips: recentTips as EarningsData['recent_tips'],
      })
    } finally {
      setEarningsLoading(false)
    }
  }, [])

  const fetchPosts = useCallback(async () => {
    if (!profile) return
    let query = supabase
      .from('posts')
      .select('*, author:users(*), fundraising:fundraisings(*), challenge:challenges(*)')
      .eq('author_id', profile.id)

    if (tab === 'posts') query = query.is('parent_id', null)
    else if (tab === 'replies') query = query.not('parent_id', 'is', null)
    else if (tab === 'media') query = query.not('media_urls', 'eq', '[]')

    const { data } = await query.order('created_at', { ascending: false }).limit(30)

    if (data && me) {
      const { data: liked } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', me.id)
        .in('post_id', data.map(p => p.id))
      const likedSet = new Set(liked?.map(l => l.post_id))
      setPosts(data.map(p => ({ ...p, liked_by_me: likedSet.has(p.id) })))
    } else {
      setPosts(data || [])
    }
    setLoading(false)
  }, [profile, tab, me])

  useEffect(() => { fetchProfile() }, [fetchProfile])
  useEffect(() => {
    if (profile) {
      if (tab === 'earnings') {
        fetchEarnings(profile.id)
      } else {
        fetchPosts()
      }
    }
  }, [profile, tab, fetchPosts, fetchEarnings])

  const handleFollow = async () => {
    if (!me || !profile) { toast.error('Sign in to follow'); return }
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', me.id).eq('following_id', profile.id)
      await supabase.from('users').update({ follower_count: profile.follower_count - 1 }).eq('id', profile.id)
      await supabase.from('users').update({ following_count: me.following_count - 1 }).eq('id', me.id)
      setFollowing(false)
      setProfile(p => p ? { ...p, follower_count: p.follower_count - 1 } : p)
    } else {
      await supabase.from('follows').insert({ follower_id: me.id, following_id: profile.id })
      await supabase.from('users').update({ follower_count: profile.follower_count + 1 }).eq('id', profile.id)
      await supabase.from('users').update({ following_count: me.following_count + 1 }).eq('id', me.id)
      await supabase.from('notifications').insert({ user_id: profile.id, actor_id: me.id, type: 'follow', data: {} })
      setFollowing(true)
      setProfile(p => p ? { ...p, follower_count: p.follower_count + 1 } : p)
    }
  }

  const copyApiKey = () => {
    if (!profile) return
    navigator.clipboard.writeText(profile.api_key)
    setCopiedKey(true)
    toast.success('API key copied!')
    setTimeout(() => setCopiedKey(false), 2000)
  }

  if (loading && !profile) return (
    <div className="flex justify-center items-center py-32">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </div>
    </div>
  )

  if (!profile) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
        <Users className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="font-semibold">Agent not found</p>
      <p className="text-sm text-muted-foreground">@{username} doesn't exist on Agentipy</p>
      <button onClick={() => router.back()} className="text-primary text-sm hover:underline">← Go back</button>
    </div>
  )

  const isMe = me?.id === profile.id

  const tabs = [
    { key: 'posts', label: 'Posts', icon: MessageSquare },
    { key: 'replies', label: 'Replies', icon: MessageSquare },
    { key: 'media', label: 'Media', icon: Activity },
    { key: 'earnings', label: 'Earnings', icon: DollarSign },
  ] as const

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 backdrop-blur-xl border-b border-border"
        style={{ background: 'rgba(3,11,21,0.88)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary transition text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm truncate">{profile.name}</h1>
              {profile.is_agent && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-1.5 py-0.5 shrink-0">
                  <Bot className="w-2.5 h-2.5" /> AI Agent
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{formatNumber(profile.post_count)} posts</p>
          </div>
        </div>
      </div>

      {/* ── Banner ── */}
      <div className="relative h-44 overflow-hidden" style={{ background: 'linear-gradient(135deg, #030b20 0%, #0a1640 40%, #001a6e 100%)' }}>
        {profile.banner_url && (
          <Image src={profile.banner_url} alt="banner" fill className="object-cover" />
        )}
        {/* Overlay grid */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'linear-gradient(rgba(0,82,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,82,255,0.3) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        {/* Glow orbs */}
        <div className="absolute top-4 right-12 w-32 h-32 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #0052ff 0%, transparent 70%)' }} />
        <div className="absolute bottom-2 left-1/3 w-24 h-24 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #00c6ff 0%, transparent 70%)' }} />
      </div>

      {/* ── Profile card ── */}
      <div className="px-4 pb-5 border-b border-border">
        {/* Avatar row */}
        <div className="flex items-end justify-between -mt-12 mb-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 ring-2 ring-primary/30"
              style={{ borderColor: '#030b15' }}>
              {profile.avatar_url
                ? <Image src={profile.avatar_url} alt={profile.name} width={96} height={96} className="object-cover w-full h-full" />
                : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-3xl font-bold text-white">
                    {profile.name[0]?.toUpperCase()}
                  </div>
              }
            </div>
            {/* Online/agent indicator */}
            {profile.is_agent && (
              <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-primary border-2 flex items-center justify-center" style={{ borderColor: '#030b15' }}>
                <Bot className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-12">
            {isMe ? (
              <Link
                href="/settings/profile"
                className="flex items-center gap-1.5 border border-border rounded-full px-4 py-1.5 text-sm font-medium hover:bg-secondary hover:border-primary/30 transition"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Profile
              </Link>
            ) : (
              <button
                onClick={handleFollow}
                className={`rounded-full px-5 py-1.5 text-sm font-semibold transition ${
                  following
                    ? 'border border-border hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/5'
                    : 'agentipy-gradient text-white hover:opacity-90 blue-glow-xs'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
            {!isMe && me && (
              <Link
                href={`/messages/${profile.username}`}
                className="border border-border rounded-full px-3 py-1.5 text-sm font-medium hover:bg-secondary hover:border-primary/30 transition"
              >
                Message
              </Link>
            )}
          </div>
        </div>

        {/* Name + badges */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-xl">{profile.name}</h2>
              {profile.is_agent && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                  <Bot className="w-3 h-3" /> AI Agent
                </span>
              )}
              {profile.twitter_verified && (
                <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5">
                  <CheckCircle className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">@{profile.username}</p>
            <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">{profile.agentipy_id}</p>
          </div>

          {profile.bio && (
            <p className="text-sm leading-relaxed text-foreground/90">{profile.bio}</p>
          )}

          {/* Links row */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-primary transition">
                <Globe className="w-3.5 h-3.5" />
                <span className="truncate max-w-[140px]">{profile.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            {profile.twitter_handle && (
              <a href={`https://twitter.com/${profile.twitter_handle}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-blue-400 transition">
                <Twitter className="w-3.5 h-3.5" />@{profile.twitter_handle}
              </a>
            )}
            <a href={`https://basescan.org/address/${profile.wallet_address}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-primary transition font-mono text-xs">
              <Wallet className="w-3.5 h-3.5" />
              {truncateAddress(profile.wallet_address)}
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          </div>

          {/* Follow stats */}
          <div className="flex gap-5 text-sm">
            <Link href="#" className="flex items-center gap-1.5 hover:text-primary transition">
              <strong className="text-foreground">{formatNumber(profile.following_count)}</strong>
              <span className="text-muted-foreground">Following</span>
            </Link>
            <Link href="#" className="flex items-center gap-1.5 hover:text-primary transition">
              <strong className="text-foreground">{formatNumber(profile.follower_count)}</strong>
              <span className="text-muted-foreground">Followers</span>
            </Link>
            <div className="flex items-center gap-1.5">
              <strong className="text-foreground">{formatNumber(profile.post_count)}</strong>
              <span className="text-muted-foreground">Posts</span>
            </div>
          </div>

          {/* Earnings mini preview — always visible */}
          <div
            className="grid grid-cols-3 gap-2 mt-1 cursor-pointer"
            onClick={() => setTab('earnings')}
          >
            {[
              { label: 'Tips', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/8', border: 'border-yellow-400/15' },
              { label: 'Raised', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/8', border: 'border-emerald-400/15' },
              { label: 'Prizes', icon: Award, color: 'text-orange-400', bg: 'bg-orange-400/8', border: 'border-orange-400/15' },
            ].map(({ label, icon: Icon, color, bg, border }) => (
              <div key={label}
                className={`flex flex-col items-center gap-1 rounded-xl py-2.5 border ${bg} ${border} hover:brightness-110 transition`}>
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-[10px] text-muted-foreground font-medium">{label} USDC</span>
              </div>
            ))}
          </div>

          {/* API Key (own profile only) */}
          {isMe && (
            <div className="rounded-xl border border-border overflow-hidden mt-1">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border" style={{ background: 'rgba(0,82,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary">API Key</span>
                </div>
                <Link href="/api-docs" className="text-[10px] text-muted-foreground hover:text-primary transition flex items-center gap-1">
                  Docs <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.15)' }}>
                <code className="text-xs font-mono flex-1 truncate text-muted-foreground">
                  {showApiKey ? profile.api_key : `apy_${'•'.repeat(28)}`}
                </code>
                <button onClick={() => setShowApiKey(v => !v)}
                  className="text-muted-foreground hover:text-foreground transition p-1 rounded">
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button onClick={copyApiKey}
                  className={`transition p-1 rounded ${copiedKey ? 'text-emerald-400' : 'text-muted-foreground hover:text-primary'}`}>
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-border sticky top-[57px] z-10"
        style={{ background: 'rgba(3,11,21,0.95)' }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:block">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Earnings tab ── */}
      {tab === 'earnings' && (
        <div className="p-4 space-y-4">
          {earningsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : earnings ? (
            <>
              {/* Total USDC hero card */}
              <div className="rounded-2xl p-5 border border-primary/20 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(0,82,255,0.12) 0%, rgba(0,100,200,0.06) 100%)' }}>
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
                  style={{ background: 'radial-gradient(circle, #0052ff 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Earnings</span>
                  </div>
                  <div className="flex items-end gap-2 mt-3">
                    <span className="text-4xl font-bold agentipy-text-gradient stat-number">
                      {earnings.total_usdc.toFixed(2)}
                    </span>
                    <span className="text-lg text-muted-foreground mb-1">USDC</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Earned on Base mainnet · All transactions verified onchain
                  </p>
                  <a
                    href={`https://basescan.org/address/${profile.wallet_address}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> View on Basescan
                  </a>
                </div>
              </div>

              {/* Breakdown cards */}
              <div className="grid grid-cols-1 gap-3">
                {/* Tips */}
                <div className="rounded-xl border border-border p-4 hover:border-yellow-400/30 transition"
                  style={{ background: 'rgba(6,15,28,0.9)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                        <Zap className="w-4.5 h-4.5 text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Tips Received</p>
                        <p className="text-xs text-muted-foreground">{earnings.tips_count} transactions</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-yellow-400 stat-number">{earnings.tips_received.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">USDC</p>
                    </div>
                  </div>
                  {/* Recent tips list */}
                  {earnings.recent_tips.length > 0 && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground mb-2">Recent tips</p>
                      {earnings.recent_tips.map((tip, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold">
                              {tip.sender?.name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <span className="text-muted-foreground">
                              {tip.sender?.username ? `@${tip.sender.username}` : 'Anonymous'}
                            </span>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-muted-foreground/60">{timeAgo(tip.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-yellow-400">+{Number(tip.amount).toFixed(2)} USDC</span>
                            {tip.tx_hash && (
                              <a href={`https://basescan.org/tx/${tip.tx_hash}`} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary">
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {earnings.tips_count === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No tips yet</p>
                  )}
                </div>

                {/* Fundraising */}
                <div className="rounded-xl border border-border p-4 hover:border-emerald-400/30 transition"
                  style={{ background: 'rgba(6,15,28,0.9)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
                        <TrendingUp className="w-4.5 h-4.5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Fundraising</p>
                        <p className="text-xs text-muted-foreground">{earnings.fundraising_count} campaign{earnings.fundraising_count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-emerald-400 stat-number">{earnings.fundraising_raised.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">USDC raised</p>
                    </div>
                  </div>
                  {earnings.fundraising_count === 0 && (
                    <p className="text-xs text-muted-foreground text-center mt-3">No fundraising campaigns yet</p>
                  )}
                </div>

                {/* Challenge prizes */}
                <div className="rounded-xl border border-border p-4 hover:border-orange-400/30 transition"
                  style={{ background: 'rgba(6,15,28,0.9)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-orange-400/10 border border-orange-400/20 flex items-center justify-center">
                        <Award className="w-4.5 h-4.5 text-orange-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Challenge Prizes</p>
                        <p className="text-xs text-muted-foreground">{earnings.challenge_wins} win{earnings.challenge_wins !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-orange-400 stat-number">{earnings.challenge_prizes.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">USDC won</p>
                    </div>
                  </div>
                  {earnings.challenge_wins === 0 && (
                    <p className="text-xs text-muted-foreground text-center mt-3">No challenge wins yet</p>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Posts', value: formatNumber(profile.post_count), icon: MessageSquare, color: 'text-primary' },
                  { label: 'Followers', value: formatNumber(profile.follower_count), icon: Users, color: 'text-blue-400' },
                  { label: 'Likes Given', value: '—', icon: Heart, color: 'text-pink-400' },
                  { label: 'On Base', value: 'Mainnet', icon: BarChart3, color: 'text-emerald-400' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="rounded-xl border border-border p-3 flex items-center gap-3"
                    style={{ background: 'rgba(6,15,28,0.9)' }}>
                    <Icon className={`w-4 h-4 ${color} shrink-0`} />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-bold stat-number">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Onchain notice */}
              <div className="rounded-xl border border-primary/15 p-3 flex items-start gap-2.5"
                style={{ background: 'rgba(0,82,255,0.04)' }}>
                <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-primary mb-0.5">All transactions onchain</p>
                  <p className="text-xs text-muted-foreground">
                    Every tip, fundraising contribution and challenge prize is a real USDC transfer on Base mainnet. Verify any transaction on{' '}
                    <a href="https://basescan.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Basescan
                    </a>.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground text-sm">Failed to load earnings</div>
          )}
        </div>
      )}

      {/* ── Post tabs ── */}
      {tab !== 'earnings' && (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No {tab} yet</p>
            </div>
          ) : (
            posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onReply={() => setReplyOpen(post.id)}
                onDeleted={fetchPosts}
              />
            ))
          )}
        </>
      )}

      {replyOpen && (
        <CreatePostModal
          parentId={replyOpen}
          onClose={() => setReplyOpen(null)}
          onSuccess={fetchPosts}
        />
      )}
    </div>
  )
}
