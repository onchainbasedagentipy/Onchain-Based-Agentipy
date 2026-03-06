'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Heart, MessageCircle, Share2, Zap, TrendingUp, Trophy,
  MoreHorizontal, Bot, CheckCircle, Edit2, Trash2, Heart as HeartIcon
} from 'lucide-react'
import type { Post } from '@/lib/types'
import { timeAgo, formatNumber, isValidEthAddress } from '@/lib/utils-agentipy'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { TipModal } from './TipModal'
import { ShareModal } from './ShareModal'
import { DonateModal } from './DonateModal'
import { AcceptChallengeModal } from './AcceptChallengeModal'

interface PostCardProps {
  post: Post
  onReply?: () => void
  onDeleted?: () => void
  compact?: boolean
}

export function PostCard({ post, onReply, onDeleted, compact }: PostCardProps) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(post.liked_by_me || false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [tipOpen, setTipOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [fundingPool, setFundingPool] = useState(false)
  const [poolFunded, setPoolFunded] = useState(post.challenge?.pool_funded ?? false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content)
  const [editLoading, setEditLoading] = useState(false)
  const [raisedAmount, setRaisedAmount] = useState(post.fundraising?.raised_amount ?? 0)

  if (deleted) return null

  const handleLike = async () => {
    if (!user) { toast.error('Sign in to like posts'); return }
    if (liked) {
      await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', post.id)
      await supabase.from('posts').update({ like_count: likeCount - 1 }).eq('id', post.id)
      setLiked(false); setLikeCount(c => c - 1)
    } else {
      await supabase.from('likes').insert({ user_id: user.id, post_id: post.id })
      await supabase.from('posts').update({ like_count: likeCount + 1 }).eq('id', post.id)
      setLiked(true); setLikeCount(c => c + 1)
      if (user.id !== post.author_id) {
        await supabase.from('notifications').insert({ user_id: post.author_id, actor_id: user.id, type: 'like', post_id: post.id, data: {} })
      }
    }
  }

  const handleDelete = async () => {
    if (!user || user.id !== post.author_id) return
    if (!confirm('Delete this post? This cannot be undone.')) return
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (!error) { setDeleted(true); toast.success('Post deleted'); onDeleted?.() }
    else toast.error('Failed to delete')
    setMenuOpen(false)
  }

  const handleFundPool = async () => {
    if (!user) { toast.error('Sign in to fund'); return }
    if (typeof window === 'undefined' || !(window as any).ethereum) { toast.error('No wallet detected. Install MetaMask.'); return }
    setFundingPool(true)
    try {
      const eth = (window as any).ethereum
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] }) } catch (e: any) {
        if (e.code === 4902) await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x2105', chainName: 'Base', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] })
      }
      const units = BigInt(Math.round((post.challenge!.pool_amount) * 1_000_000))
      const data = '0xa9059cbb' + accounts[0].slice(2).padStart(64, '0') + units.toString(16).padStart(64, '0')
      const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      const txHash: string = await eth.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: USDC, data, chainId: '0x2105' }] })
      await supabase.from('challenges').update({ pool_funded: true, pool_tx_hash: txHash }).eq('id', post.challenge!.id)
      setPoolFunded(true)
      toast.success('Pool funded!')
    } catch (e: any) {
      if (e.code === 4001) toast.error('Transaction rejected')
      else toast.error(e.message || 'Funding failed')
    } finally { setFundingPool(false) }
  }

  const handleEditSave = async () => {
    if (!editContent.trim()) { toast.error('Post cannot be empty'); return }
    setEditLoading(true)
    const { error } = await supabase.from('posts').update({
      content: editContent.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', post.id)
    if (!error) {
      toast.success('Post updated')
      post.content = editContent.trim()
      setEditing(false)
    } else {
      toast.error('Failed to update')
    }
    setEditLoading(false)
    setMenuOpen(false)
  }

  const renderContent = (text: string) =>
    text.split(/(#\w+|\$\w+|@\w+)/g).map((part, i) => {
      if (part.startsWith('#')) return <Link key={i} href={`/hashtag/${part.slice(1)}`} className="text-[#4d8bff] hover:underline transition-colors">{part}</Link>
      if (part.startsWith('$')) return <span key={i} className="text-yellow-400 font-semibold">{part}</span>
      if (part.startsWith('@')) return <Link key={i} href={`/profile/${part.slice(1)}`} className="text-[#4d8bff] hover:underline transition-colors">{part}</Link>
      return <span key={i}>{part}</span>
    })

  const PostBadge = () => {
    if (post.post_type === 'fundraising') return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5 font-semibold">
        <TrendingUp className="w-2.5 h-2.5" /> Fundraising
      </span>
    )
    if (post.post_type === 'challenge') return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-2 py-0.5 font-semibold">
        <Trophy className="w-2.5 h-2.5" /> Challenge
      </span>
    )
    return null
  }

  const fr = post.fundraising
  const ch = post.challenge
  const frGoal = fr?.goal_amount ?? 1
  const frPct = Math.min(100, (raisedAmount / frGoal) * 100)

  return (
    <div
      className="post-card border-b border-white/[0.05] px-4 py-3.5 cursor-pointer"
      onClick={() => !compact && onReply?.()}
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <Link href={`/profile/${post.author?.username}`} className="flex-shrink-0" onClick={e => e.stopPropagation()}>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-[#0d1929] ring-1 ring-white/10 hover:ring-[#0052ff]/40 transition-all">
            {post.author?.avatar_url
              ? <Image src={post.author.avatar_url} alt={post.author.name} width={40} height={40} className="object-cover w-full h-full" />
              : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-sm font-bold text-white">{post.author?.name?.[0] || '?'}</div>
            }
          </div>
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <Link
                href={`/profile/${post.author?.username}`}
                className="font-semibold text-[13px] hover:text-[#4d8bff] transition-colors truncate max-w-[120px] sm:max-w-none"
                onClick={e => e.stopPropagation()}
              >{post.author?.name}</Link>
              {post.author?.is_agent && <Bot className="w-3.5 h-3.5 text-[#4d8bff] flex-shrink-0" title="AI Agent" />}
              {post.author?.twitter_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="Verified" />}
              <span className="text-[#5a6d85] text-[11px] truncate">@{post.author?.username}</span>
              <span className="text-[#3a4e62] text-[11px] hidden sm:inline">·</span>
              <span className="text-[#5a6d85] text-[11px] hidden sm:inline">{timeAgo(post.created_at)}</span>
              <PostBadge />
            </div>

            {user?.id === post.author_id && !compact && (
              <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="p-1.5 text-[#5a6d85] hover:text-foreground hover:bg-white/[0.05] rounded-lg transition"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-7 rounded-2xl shadow-2xl z-20 min-w-[140px] overflow-hidden"
                    style={{ background: '#0a1828', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                      onClick={() => { setEditing(true); setMenuOpen(false) }}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/[0.04] transition w-full"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-[#4d8bff]" /> Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-white/[0.04] transition w-full"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] text-[#5a6d85] mb-1.5 sm:hidden">{timeAgo(post.created_at)}</p>

          {/* Post text / inline editor */}
          {editing ? (
            <div className="space-y-2 mt-1" onClick={e => e.stopPropagation()}>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                autoFocus
                rows={3}
                maxLength={500}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-[#0052ff]/50 transition"
                style={{ background: '#0d1929', border: '1px solid rgba(0,82,255,0.3)', color: '#e2e8f0' }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#3a4d62]">{editContent.length}/500</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditing(false); setEditContent(post.content) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#5a6d85] hover:text-white transition"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >Cancel</button>
                  <button
                    onClick={handleEditSave}
                    disabled={editLoading || !editContent.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition disabled:opacity-50 flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg,#0052ff,#0ea5e9)' }}
                  >
                    {editLoading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-[#c8d8ec]">
              {renderContent(post.content)}
              {post.updated_at && post.updated_at !== post.created_at && (
                <span className="text-[10px] text-[#3a4d62] ml-1">(edited)</span>
              )}
            </p>
          )}

          {/* Media */}
          {post.media_urls && post.media_urls.length > 0 && (
            <div className={`mt-2.5 grid gap-1 rounded-2xl overflow-hidden ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {post.media_urls.slice(0, 4).map((url, i) => (
                <div key={i} className="relative aspect-video bg-[#0d1929]">
                  {url.match(/\.(mp4|webm|mov)$/i)
                    ? <video src={url} controls className="w-full h-full object-cover" />
                    : <Image src={url} alt={`media-${i}`} fill className="object-cover" />
                  }
                </div>
              ))}
            </div>
          )}

          {/* ── Fundraising card with Donate button ── */}
          {post.post_type === 'fundraising' && fr && (
            <div
              className="mt-2.5 rounded-xl border overflow-hidden"
              style={{ background: 'rgba(16,185,129,0.04)', borderColor: 'rgba(16,185,129,0.2)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3 pt-3 pb-2 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-emerald-400 font-semibold text-[11px] truncate">{fr.title}</p>
                    {fr.reason && <p className="text-[#5a6d85] text-[10px] line-clamp-1 mt-0.5">{fr.reason}</p>}
                  </div>
                  <span className="text-[10px] text-[#5a6d85] flex-shrink-0 tabular-nums">{raisedAmount} / {fr.goal_amount} USDC</span>
                </div>
                {/* Progress bar */}
                <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: '#0d1929' }}>
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${frPct}%`, background: 'linear-gradient(90deg, #059669, #34d399)' }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#5a6d85]">
                  <span>{frPct.toFixed(0)}% funded</span>
                  {fr.is_completed && <span className="text-emerald-400 font-semibold">✓ Goal reached!</span>}
                </div>
              </div>
              {/* Donate button */}
              {!fr.is_completed && (
                <button
                  onClick={() => user ? setDonateOpen(true) : toast.error('Sign in to donate')}
                  className="w-full py-2.5 text-xs font-bold text-emerald-400 hover:text-white transition flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(16,185,129,0.08)', borderTop: '1px solid rgba(16,185,129,0.15)' }}
                >
                  <HeartIcon className="w-3.5 h-3.5" />
                  Donate USDC
                </button>
              )}
            </div>
          )}

          {/* ── Challenge card with Accept / Release button ── */}
          {post.post_type === 'challenge' && ch && (
            <div
              className="mt-2.5 rounded-xl border overflow-hidden"
              style={{ background: 'rgba(249,115,22,0.04)', borderColor: 'rgba(249,115,22,0.2)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3 pt-3 pb-2 space-y-2">
                <p className="text-[11px] text-[#c8d8ec] line-clamp-2 leading-relaxed">{ch.command}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-orange-400 font-bold text-[11px]">{ch.pool_amount} USDC</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${poolFunded ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'}`}>
                    {poolFunded ? '✓ Funded' : 'Awaiting fund'}
                  </span>
                  {ch.is_completed && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#4d8bff]/10 text-[#4d8bff]">✓ Completed</span>
                  )}
                  {/* Fund Pool button — only visible to challenge creator when pool is unfunded */}
                  {user?.id === post.author_id && !poolFunded && !ch.is_completed && (
                    <button
                      onClick={() => handleFundPool()}
                      disabled={fundingPool}
                      className="text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 transition disabled:opacity-50"
                      style={{ background: 'rgba(0,82,255,0.15)', color: '#4d8bff', border: '1px solid rgba(0,82,255,0.3)' }}
                    >
                      {fundingPool
                        ? <><span className="w-2.5 h-2.5 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />Funding…</>
                        : <>💰 Fund Pool</>}
                    </button>
                  )}
                </div>
              </div>
              {/* Action button */}
              {!ch.is_completed && (
                <button
                  onClick={() => user ? setChallengeOpen(true) : toast.error('Sign in to participate')}
                  className="w-full py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  style={{
                    background: user?.id === post.author_id ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.08)',
                    borderTop: '1px solid rgba(249,115,22,0.15)',
                    color: '#f97316'
                  }}
                >
                  <Trophy className="w-3.5 h-3.5" />
                  {user?.id === post.author_id ? 'Release Reward' : 'Accept Challenge'}
                </button>
              )}
            </div>
          )}

          {/* Actions row */}
          {!compact && (
            <div className="flex items-center gap-0.5 mt-3" onClick={e => e.stopPropagation()}>
              <button onClick={onReply}
                className="flex items-center gap-1.5 text-[#5a6d85] hover:text-[#4d8bff] hover:bg-[#4d8bff]/10 transition rounded-full px-2.5 py-1.5 text-[11px] font-medium">
                <MessageCircle className="w-4 h-4" />
                <span>{formatNumber(post.reply_count)}</span>
              </button>
              <button onClick={handleLike}
                className={`flex items-center gap-1.5 transition rounded-full px-2.5 py-1.5 text-[11px] font-medium ${
                  liked ? 'text-rose-400 bg-rose-500/10' : 'text-[#5a6d85] hover:text-rose-400 hover:bg-rose-500/10'
                }`}>
                <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                <span>{formatNumber(likeCount)}</span>
              </button>
              {post.post_type === 'regular' && (
                <button
                  onClick={() => user ? setTipOpen(true) : toast.error('Sign in to tip')}
                  className="flex items-center gap-1.5 text-[#5a6d85] hover:text-yellow-400 hover:bg-yellow-400/10 transition rounded-full px-2.5 py-1.5 text-[11px] font-medium"
                >
                  <Zap className="w-4 h-4" />
                  <span>{post.tip_total > 0 ? `${post.tip_total} USDC` : 'Tip'}</span>
                </button>
              )}
              <button onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 text-[#5a6d85] hover:text-[#4d8bff] hover:bg-[#4d8bff]/10 transition rounded-full px-2.5 py-1.5 text-[11px] ml-auto">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {tipOpen && post.author && <TipModal post={post} onClose={() => setTipOpen(false)} />}
      {shareOpen && <ShareModal post={post} onClose={() => setShareOpen(false)} />}
      {donateOpen && fr && (
        <DonateModal
          post={post}
          onClose={() => setDonateOpen(false)}
          onDonated={amount => setRaisedAmount(r => r + amount)}
        />
      )}
      {challengeOpen && ch && (
        <AcceptChallengeModal
          post={post}
          onClose={() => setChallengeOpen(false)}
          onJoined={() => setChallengeOpen(false)}
        />
      )}
    </div>
  )
}
