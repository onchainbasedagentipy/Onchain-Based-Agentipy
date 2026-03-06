'use client'

import { useState, useEffect } from 'react'
import { X, Trophy, ExternalLink, CheckCircle, Users, Zap, Bot, Copy, Check, Send, Crown, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Post } from '@/lib/types'
import Image from 'next/image'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

interface AcceptChallengeModalProps {
  post: Post
  onClose: () => void
  onJoined?: () => void
}

type ViewMode = 'info' | 'join' | 'release'

interface VerifiedParticipant {
  id: string
  user_id: string
  verification_text: string
  user: { id: string; username: string; name: string; avatar_url?: string; wallet_address?: string } | null
}

export function AcceptChallengeModal({ post, onClose, onJoined }: AcceptChallengeModalProps) {
  const { user } = useAuth()
  const ch = post.challenge!
  const isOwner = user?.id === post.author_id

  const [view, setView] = useState<ViewMode>('info')
  const [verificationText, setVerificationText] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  // Release reward state
  const [releaseDone, setReleaseDone] = useState(false)
  const [verifiedParticipants, setVerifiedParticipants] = useState<VerifiedParticipant[]>([])
  const [selectedWinnerIds, setSelectedWinnerIds] = useState<Set<string>>(new Set())
  const [releasing, setReleasing] = useState(false)
  const [releaseResults, setReleaseResults] = useState<Array<{ user_id: string; username: string; prize_amount: number; prize_tx_hash?: string }>>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)

  // Load verified participants when owner opens release tab
  useEffect(() => {
    if (view !== 'release' || !isOwner) return
    setLoadingParticipants(true)
    supabase
      .from('challenge_participants')
      .select('id, user_id, verification_text, user:users(id, username, name, avatar_url, wallet_address)')
      .eq('challenge_id', ch.id)
      .eq('is_verified', true)
      .eq('is_winner', false)
      .then(({ data }) => {
        setVerifiedParticipants((data as any) || [])
        setLoadingParticipants(false)
      })
  }, [view, isOwner, ch.id])

  const copyApiSnippet = () => {
    const snippet = isOwner
      ? `POST /api/v1/challenges/${ch.id}/release\nx-api-key: YOUR_API_KEY\n{ "winner_ids": ["user_id_1", "user_id_2"] }`
      : `POST /api/v1/challenges/${ch.id}/join\nx-api-key: YOUR_API_KEY\n{ "verification_text": "I completed the challenge!" }`
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleWinner = (userId: string) => {
    setSelectedWinnerIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else if (next.size >= 3) {
        toast.error('Max 3 winners allowed')
      } else {
        next.add(userId)
      }
      return next
    })
  }

  /* ── Join challenge ── */
  const handleJoin = async () => {
    if (!user) { toast.error('Sign in to join'); return }
    if (!verificationText.trim()) { toast.error('Add a verification message'); return }
    setLoading(true)
    try {
      const { data: existing } = await supabase
        .from('challenge_participants')
        .select('id')
        .eq('challenge_id', ch.id)
        .eq('user_id', user.id)
        .single()
      if (existing) { toast.error('You already joined this challenge'); setLoading(false); return }

      const { error } = await supabase.from('challenge_participants').insert({
        challenge_id: ch.id,
        user_id: user.id,
        verification_text: verificationText,
        verification_media: [],
      })
      if (error) throw new Error(error.message)

      // Notify creator
      await supabase.from('notifications').insert({
        user_id: post.author_id,
        actor_id: user.id,
        type: 'challenge_join',
        post_id: post.id,
        data: { challenge_id: ch.id }
      })

      setDone(true)
      onJoined?.()
      toast.success('Challenge accepted! Good luck!')
    } catch (e: any) {
      toast.error(e.message || 'Failed to join')
    } finally {
      setLoading(false)
    }
  }

  /* ── Release rewards (owner manual selection) ── */
  const handleRelease = async () => {
    if (!user) return
    if (selectedWinnerIds.size === 0) { toast.error('Select at least one winner'); return }
    if (!ch.pool_funded) { toast.error('Fund the pool before releasing rewards'); return }

    if (typeof window === 'undefined' || !(window as any).ethereum) {
      toast.error('No wallet detected. Install MetaMask.')
      return
    }

    setReleasing(true)
    try {
      const eth = (window as any).ethereum
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      if (!accounts.length) throw new Error('No accounts connected')

      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] })
      } catch (err: any) {
        if (err.code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: '0x2105', chainName: 'Base', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }]
          })
        }
      }

      const selectedWinners = verifiedParticipants.filter(p => selectedWinnerIds.has(p.user_id))
      const prizePerWinner = ch.pool_amount / selectedWinners.length
      const results: typeof releaseResults = []

      // Send USDC to each winner atomically — if any fail, we stop and report
      for (const winner of selectedWinners) {
        const walletAddress = winner.user?.wallet_address
        if (!walletAddress) {
          toast.error(`@${winner.user?.username} has no wallet linked — skipping`)
          continue
        }
        const units = BigInt(Math.round(prizePerWinner * 1_000_000))
        const data = '0xa9059cbb' + walletAddress.slice(2).padStart(64, '0') + units.toString(16).padStart(64, '0')
        const hash: string = await eth.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: USDC_ADDRESS, data, chainId: '0x2105' }] })
        results.push({ user_id: winner.user_id, username: winner.user?.username || '', prize_amount: prizePerWinner, prize_tx_hash: hash })
      }

      if (results.length === 0) {
        toast.error('No winners had linked wallets — no USDC sent')
        setReleasing(false)
        return
      }

      // Update DB — mark winners, complete challenge (only after all txs succeed)
      for (const r of results) {
        const participant = selectedWinners.find(w => w.user_id === r.user_id)!
        await supabase.from('challenge_participants').update({
          is_winner: true,
          prize_amount: r.prize_amount,
          prize_tx_hash: r.prize_tx_hash,
        }).eq('id', participant.id)
        await supabase.from('notifications').insert({
          user_id: r.user_id,
          actor_id: user.id,
          type: 'challenge_win',
          post_id: post.id,
          data: { challenge_id: ch.id, prize_amount: r.prize_amount, tx_hash: r.prize_tx_hash }
        })
      }

      await supabase.from('challenges').update({
        is_completed: true,
        winners: results.map(r => r.user_id),
      }).eq('id', ch.id)

      setReleaseResults(results)
      setReleaseDone(true)
      toast.success(`Rewards sent to ${results.length} winner(s)!`)
    } catch (e: any) {
      if (e.code === 4001) toast.error('Transaction rejected')
      else toast.error(e.message || 'Release failed')
    } finally {
      setReleasing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl shadow-orange-500/10 overflow-hidden"
        style={{ background: '#060f1c', border: '1px solid rgba(249,115,22,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <Trophy className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Challenge</h2>
              <p className="text-[10px] text-[#5a6d85]">{ch.pool_amount} USDC prize pool</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#5a6d85] hover:text-white p-1.5 rounded-xl hover:bg-white/[0.05] transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {/* ── Release done state ── */}
          {releaseDone ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto">
                <Crown className="w-8 h-8 text-orange-400" />
              </div>
              <div>
                <p className="font-bold text-base text-white">Rewards Released!</p>
                <p className="text-sm text-[#5a6d85] mt-1">{ch.pool_amount} USDC sent to {releaseResults.length} winner(s)</p>
              </div>
              <div className="space-y-2">
                {releaseResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
                    <div className="flex items-center gap-2">
                      <Crown className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs text-white font-semibold">@{r.username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-orange-400 font-bold">{r.prize_amount.toFixed(2)} USDC</span>
                      {r.prize_tx_hash && (
                        <a href={`https://basescan.org/tx/${r.prize_tx_hash}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 text-[#5a6d85] hover:text-[#4d8bff]" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={onClose} className="block w-full py-2.5 rounded-xl font-bold text-sm transition text-[#5a6d85] hover:text-white" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Close
              </button>
            </div>

          ) : done ? (
            /* ── Join done state ── */
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-orange-400" />
              </div>
              <div>
                <p className="font-bold text-base text-white">Challenge Accepted!</p>
                <p className="text-sm text-[#5a6d85] mt-1">Your submission is pending verification</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <p className="text-[11px] text-[#5a6d85] leading-relaxed">
                  The challenge creator will verify your submission. If selected as a winner, {(ch.pool_amount / 3).toFixed(2)} USDC will be sent to your wallet onchain.
                </p>
              </div>
              <button onClick={onClose} className="block w-full py-2.5 rounded-xl font-bold text-sm transition text-[#5a6d85] hover:text-white" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Close
              </button>
            </div>

          ) : (
            <div className="space-y-4">
              {/* Challenge info */}
              <div className="rounded-xl p-3.5 space-y-2" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <p className="text-sm text-white font-medium leading-relaxed">{ch.command}</p>
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-xs font-bold text-orange-400">{ch.pool_amount} USDC pool</span>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ch.pool_funded ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'}`}>
                    {ch.pool_funded ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {ch.pool_funded ? 'Pool Funded' : 'Awaiting Fund'}
                  </div>
                  {ch.is_completed && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#4d8bff]/10 text-[#4d8bff]">
                      <CheckCircle className="w-3 h-3" /> Completed
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs: Join / Release (owner) */}
              {!ch.is_completed && (
                <div className="flex gap-2">
                  {!isOwner && (
                    <button
                      onClick={() => setView('join')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${view === 'join' ? 'border-orange-500/60 text-orange-400 bg-orange-500/10' : 'border-white/[0.07] text-[#5a6d85] hover:border-white/20'}`}
                    >
                      <Send className="w-3.5 h-3.5 inline mr-1.5" />Accept Challenge
                    </button>
                  )}
                  {isOwner && (
                    <button
                      onClick={() => setView('release')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${view === 'release' ? 'border-orange-500/60 text-orange-400 bg-orange-500/10' : 'border-white/[0.07] text-[#5a6d85] hover:border-white/20'}`}
                    >
                      <Crown className="w-3.5 h-3.5 inline mr-1.5" />Release Reward
                    </button>
                  )}
                  <button
                    onClick={() => setView('info')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${view === 'info' ? 'border-white/20 text-white bg-white/[0.05]' : 'border-white/[0.07] text-[#5a6d85] hover:border-white/20'}`}
                  >
                    <Users className="w-3.5 h-3.5 inline" />
                  </button>
                </div>
              )}

              {/* Join form */}
              {view === 'join' && !isOwner && !ch.is_completed && (
                <div className="space-y-3">
                  <textarea
                    value={verificationText}
                    onChange={e => setVerificationText(e.target.value)}
                    placeholder="Describe how you completed this challenge..."
                    rows={3}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-orange-500/40 transition"
                    style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }}
                  />
                  <button
                    onClick={handleJoin}
                    disabled={loading || !verificationText.trim()}
                    className="w-full rounded-xl py-3 font-bold text-sm transition disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #ea580c, #f97316)', color: 'white' }}
                  >
                    <Trophy className="w-4 h-4" />
                    {loading ? 'Submitting...' : 'Accept & Submit Proof'}
                  </button>
                </div>
              )}

              {/* Release reward form (owner) — manual winner selection */}
              {view === 'release' && isOwner && !ch.is_completed && (
                <div className="space-y-3">
                  {!ch.pool_funded && (
                    <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.2)' }}>
                      <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-orange-300 leading-relaxed">Pool not yet funded. Fund the pool first before releasing rewards.</p>
                    </div>
                  )}

                  {loadingParticipants ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-[#5a6d85]" />
                    </div>
                  ) : verifiedParticipants.length === 0 ? (
                    <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[11px] text-[#5a6d85]">No verified participants yet. Verify submissions first.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-[#5a6d85]">
                        Select up to 3 winners from verified participants. Each will receive {verifiedParticipants.length > 0 && selectedWinnerIds.size > 0 ? (ch.pool_amount / selectedWinnerIds.size).toFixed(2) : '—'} USDC.
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {verifiedParticipants.map(p => (
                          <button
                            key={p.id}
                            onClick={() => toggleWinner(p.user_id)}
                            className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 transition border ${
                              selectedWinnerIds.has(p.user_id)
                                ? 'border-orange-500/60 bg-orange-500/10'
                                : 'border-white/[0.07] hover:border-white/20'
                            }`}
                          >
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-[#0d1929] flex-shrink-0">
                              {p.user?.avatar_url
                                ? <Image src={p.user.avatar_url} alt="" width={24} height={24} className="object-cover w-full h-full" />
                                : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-[10px] text-white font-bold">{p.user?.name?.[0]}</div>
                              }
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <span className="text-[11px] font-medium text-white">@{p.user?.username}</span>
                              {p.verification_text && (
                                <p className="text-[10px] text-[#5a6d85] truncate">{p.verification_text}</p>
                              )}
                            </div>
                            {!p.user?.wallet_address && (
                              <AlertCircle className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                            )}
                            {selectedWinnerIds.has(p.user_id) && <Crown className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <button
                    onClick={handleRelease}
                    disabled={releasing || !ch.pool_funded || selectedWinnerIds.size === 0}
                    className="w-full rounded-xl py-3 font-bold text-sm transition disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                    style={{
                      background: ch.pool_funded && selectedWinnerIds.size > 0 ? 'linear-gradient(135deg, #ea580c, #f97316)' : undefined,
                      color: 'white',
                      ...(ch.pool_funded && selectedWinnerIds.size > 0 ? {} : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' })
                    }}
                  >
                    {releasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                    {releasing ? 'Sending USDC...' : selectedWinnerIds.size > 0 ? `Release to ${selectedWinnerIds.size} Winner(s)` : 'Select Winners First'}
                  </button>
                </div>
              )}

              {/* AI Agent snippet */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(77,139,255,0.04)', border: '1px solid rgba(77,139,255,0.15)' }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(77,139,255,0.1)' }}>
                  <div className="flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-[#4d8bff]" />
                    <span className="text-[11px] font-semibold text-[#4d8bff]">AI Agent API</span>
                  </div>
                  <button onClick={copyApiSnippet} className="flex items-center gap-1 text-[10px] text-[#5a6d85] hover:text-white transition">
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="px-3 py-2 text-[9.5px] text-[#4d8bff]/70 overflow-x-auto font-mono leading-relaxed">{isOwner
                  ? `POST /api/v1/challenges/${ch.id}/release\nx-api-key: YOUR_API_KEY\n{ "winner_ids": ["user_id_1"] }`
                  : `POST /api/v1/challenges/${ch.id}/join\nx-api-key: YOUR_API_KEY\n{ "verification_text": "Completed!" }`
                }</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
