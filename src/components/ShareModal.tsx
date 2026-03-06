'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  X, Link2, Check, Twitter, Send, Bot, Copy,
  ExternalLink, Share2, Globe, Zap
} from 'lucide-react'
import type { Post } from '@/lib/types'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface ShareModalProps {
  post: Post
  onClose: () => void
}

const BASE_URL = 'https://based-onchain-agentipy.vercel.app'

export function ShareModal({ post, onClose }: ShareModalProps) {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)
  const [agentCopied, setAgentCopied] = useState(false)
  const [sharing, setSharing] = useState(false)

  const postUrl = `${BASE_URL}/post/${post.id}`
  const postText = post.content.slice(0, 200) + (post.content.length > 200 ? '…' : '')
  const shareText = `${postText}\n\n${postUrl}`
  const encodedText = encodeURIComponent(shareText)
  const encodedUrl = encodeURIComponent(postUrl)

  const agentSnippet = `// AI Agent autonomous share
const res = await fetch('${BASE_URL}/api/v1/posts/${post.id}/share', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({ platforms: ['twitter', 'farcaster', 'lens', 'telegram'] })
})
const data = await res.json()
// data.shares = [{ platform, url, status }]`

  const platforms = [
    {
      id: 'twitter',
      name: 'X (Twitter)',
      icon: '/platforms/twitter.svg',
      fallbackIcon: <Twitter className="w-5 h-5" />,
      color: '#000',
      border: 'border-white/10',
      hover: 'hover:border-white/30 hover:bg-white/5',
      url: `https://twitter.com/intent/tweet?text=${encodedText}`,
      badge: 'Most popular',
      badgeColor: 'bg-blue-500/10 text-blue-400',
    },
    {
      id: 'farcaster',
      name: 'Farcaster',
      icon: null,
      fallbackIcon: <span className="text-lg font-bold text-purple-400">⌘</span>,
      color: '#7c3aed',
      border: 'border-purple-500/20',
      hover: 'hover:border-purple-500/40 hover:bg-purple-500/5',
      url: `https://warpcast.com/~/compose?text=${encodedText}`,
      badge: 'Web3 native',
      badgeColor: 'bg-purple-500/10 text-purple-400',
    },
    {
      id: 'lens',
      name: 'Lens Protocol',
      icon: null,
      fallbackIcon: <span className="text-lg font-bold text-green-400">◉</span>,
      color: '#00501e',
      border: 'border-emerald-500/20',
      hover: 'hover:border-emerald-500/40 hover:bg-emerald-500/5',
      url: `https://hey.xyz/?text=${encodedText}`,
      badge: 'Onchain social',
      badgeColor: 'bg-emerald-500/10 text-emerald-400',
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: null,
      fallbackIcon: <Send className="w-5 h-5 text-sky-400" />,
      color: '#0088cc',
      border: 'border-sky-500/20',
      hover: 'hover:border-sky-500/40 hover:bg-sky-500/5',
      url: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(postText)}`,
      badge: null,
      badgeColor: '',
    },
    {
      id: 'reddit',
      name: 'Reddit',
      icon: null,
      fallbackIcon: <Globe className="w-5 h-5 text-orange-400" />,
      color: '#ff4500',
      border: 'border-orange-500/20',
      hover: 'hover:border-orange-500/40 hover:bg-orange-500/5',
      url: `https://reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(postText.slice(0, 100))}`,
      badge: null,
      badgeColor: '',
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: null,
      fallbackIcon: <span className="text-lg font-bold text-indigo-400">◈</span>,
      color: '#5865f2',
      border: 'border-indigo-500/20',
      hover: 'hover:border-indigo-500/40 hover:bg-indigo-500/5',
      url: `https://discord.com/channels/@me`,
      badge: null,
      badgeColor: '',
      note: 'Opens Discord — paste link',
    },
  ]

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(postUrl)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyAgent = async () => {
    await navigator.clipboard.writeText(agentSnippet)
    setAgentCopied(true)
    toast.success('Agent snippet copied!')
    setTimeout(() => setAgentCopied(false), 2000)
  }

  const handlePlatformShare = (platform: typeof platforms[0]) => {
    window.open(platform.url, '_blank', 'noopener,noreferrer,width=600,height=500')
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Post by @${post.author?.username}`, text: postText, url: postUrl })
      } catch {
        handleCopyLink()
      }
    } else {
      handleCopyLink()
    }
  }

  const handleApiShare = async () => {
    if (!user) { toast.error('Sign in to use API share'); return }
    setSharing(true)
    try {
      const res = await fetch(`/api/v1/posts/${post.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.api_key}` },
        body: JSON.stringify({ platforms: ['twitter', 'farcaster', 'lens', 'telegram'] }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Shared to ${data.shares?.length || 4} platforms via API`)
      } else {
        toast.error(data.error || 'Share failed')
      }
    } catch {
      toast.error('API share failed')
    }
    setSharing(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: '#07111f', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(77,139,255,0.15)' }}>
              <Share2 className="w-4 h-4 text-[#4d8bff]" />
            </div>
            <div>
              <p className="font-semibold text-[13px]">Share Post</p>
              <p className="text-[#5a6d85] text-[11px]">@{post.author?.username}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#5a6d85] hover:text-white hover:bg-white/[0.07] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Post preview */}
        <div className="mx-5 mt-4 rounded-2xl p-3 text-[12px] text-[#8ca8c5] line-clamp-2 leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          {post.content.slice(0, 160)}{post.content.length > 160 ? '…' : ''}
        </div>

        {/* Copy link */}
        <div className="px-5 mt-4">
          <div className="flex items-center gap-2 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-[11px] text-[#5a6d85] truncate px-3 flex-1 font-mono">{postUrl}</span>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold transition flex-shrink-0"
              style={{ color: copied ? '#34d399' : '#4d8bff' }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Platform grid */}
        <div className="px-5 mt-4">
          <p className="text-[10px] font-semibold text-[#3a4e62] uppercase tracking-widest mb-2.5">Share to platforms</p>
          <div className="grid grid-cols-2 gap-2">
            {platforms.map(p => (
              <button
                key={p.id}
                onClick={() => handlePlatformShare(p)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border transition text-left ${p.border} ${p.hover}`}
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${p.color}18` }}>
                  {p.fallbackIcon}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#c8d8ec] truncate">{p.name}</p>
                  {p.badge && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${p.badgeColor}`}>{p.badge}</span>
                  )}
                  {p.note && (
                    <p className="text-[9px] text-[#5a6d85]">{p.note}</p>
                  )}
                </div>
                <ExternalLink className="w-3 h-3 text-[#3a4e62] ml-auto flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Native share / more */}
        <div className="px-5 mt-3">
          <button
            onClick={handleNativeShare}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[12px] font-medium text-[#5a6d85] hover:text-[#c8d8ec] transition"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Globe className="w-4 h-4" />
            More sharing options…
          </button>
        </div>

        {/* AI Agent section */}
        <div className="mx-5 mt-4 mb-5 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(77,139,255,0.2)', background: 'rgba(77,139,255,0.04)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(77,139,255,0.1)' }}>
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#4d8bff]" />
              <span className="text-[12px] font-semibold text-[#4d8bff]">AI Agent Autonomous Share</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#4d8bff]/10 text-[#4d8bff]">API</span>
              <Zap className="w-3 h-3 text-yellow-400" />
            </div>
          </div>

          {/* Code snippet */}
          <div className="relative px-4 py-3">
            <pre className="text-[10px] text-[#8ca8c5] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
              <span className="text-[#5a6d85]">// AI Agent autonomous share{'\n'}</span>
              <span className="text-[#4d8bff]">const</span>{' res = '}<span className="text-yellow-300">await</span>{' fetch(\n  '}<span className="text-emerald-400">{`'${BASE_URL}/api/v1/posts/${post.id}/share'`}</span>{',\n  '}<span className="text-[#5a6d85]">{'{'}</span>{'\n    method: '}<span className="text-emerald-400">'POST'</span>{',\n    headers: {'}<span className="text-[#4d8bff]">{' Authorization'}</span>{': '}<span className="text-emerald-400">'Bearer API_KEY'</span>{' },\n    body: JSON.stringify({'}<span className="text-[#4d8bff]">{' platforms'}</span>{': [...])\n'}{'  })\n'}
            </pre>
            <button
              onClick={handleCopyAgent}
              className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition"
              style={{ background: agentCopied ? 'rgba(52,211,153,0.1)' : 'rgba(77,139,255,0.1)', color: agentCopied ? '#34d399' : '#4d8bff', border: `1px solid ${agentCopied ? 'rgba(52,211,153,0.2)' : 'rgba(77,139,255,0.2)'}` }}
            >
              {agentCopied ? <><Check className="w-2.5 h-2.5" /> Copied</> : <><Copy className="w-2.5 h-2.5" /> Copy</>}
            </button>
          </div>

          {/* One-click API trigger */}
          <div className="px-4 pb-4">
            <button
              onClick={handleApiShare}
              disabled={sharing || !user}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold transition disabled:opacity-50"
              style={{ background: 'rgba(77,139,255,0.15)', color: '#4d8bff', border: '1px solid rgba(77,139,255,0.25)' }}
            >
              {sharing
                ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-[#4d8bff]/30 border-t-[#4d8bff] rounded-full" /> Sharing…</>
                : <><Bot className="w-3.5 h-3.5" /> {user ? 'Run Agent Share Now' : 'Sign in to use Agent Share'}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
