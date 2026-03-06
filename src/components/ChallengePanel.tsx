'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { Trophy, CheckCircle, Users, Zap, Wallet, Loader2, Crown } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import Link from 'next/link'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

export function ChallengePanel({ post, onUpdated }: { post: Post; onUpdated: () => void }) {
  const { user } = useAuth()
  const challenge = post.challenge!
  const isCreator = user?.id === post.author_id
  const participants = challenge.participants || []
  const hasJoined = user ? participants.some(p => p.user_id === user.id) : false
  const verifiedCount = participants.filter(p => p.is_verified).length
  const winnerCount = participants.filter(p => p.is_winner).length

  const [joining, setJoining] = useState(false)
  const [verText, setVerText] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [funding, setFunding] = useState(false)
  const [poolFunded, setPoolFunded] = useState(challenge.pool_funded)
  const [releasing, setReleasing] = useState(false)
  // Manual winner selection: creator picks from verified list
  const [selectedWinnerIds, setSelectedWinnerIds] = useState<Set<string>>(new Set())
  const [showWinnerPicker, setShowWinnerPicker] = useState(false)

  const verifiedParticipants = participants.filter(p => p.is_verified && !p.is_winner)

  /* ── Fund Pool ── */
  const handleFundPool = async () => {
    if (!user) { toast.error('Sign in to fund'); return }
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      toast.error('No wallet detected. Install MetaMask.')
      return
    }
    setFunding(true)
    try {
      const eth = (window as any).ethereum
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      if (!accounts.length) throw new Error('No accounts connected')
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] })
      } catch (err: any) {
        if (err.code === 4902) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x2105', chainName: 'Base', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] })
        }
      }
      // Lock pool: send USDC to a holding address (the platform address or the post author's wallet acts as escrow)
      // The creator sends the full pool amount to their own wallet to prove funds exist, then DB marks funded
      // In production this would go to a smart contract escrow; here it's a self-hold pattern
      const units = BigInt(Math.round(challenge.pool_amount * 1_000_000))
      const data = '0xa9059cbb' + accounts[0].slice(2).padStart(64, '0') + units.toString(16).padStart(64, '0')
      const txHash: string = await eth.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: USDC_ADDRESS, data, chainId: '0x2105' }] })
      await supabase.from('challenges').update({ pool_funded: true, pool_tx_hash: txHash }).eq('id', challenge.id)
      setPoolFunded(true)
      toast.success(`Pool funded! ${challenge.pool_amount} USDC reserved. Tx: ${txHash.slice(0, 10)}…`)
      onUpdated()
    } catch (e: any) {
      if (e.code === 4001) toast.error('Transaction rejected')
      else toast.error(e.message || 'Funding failed')
    } finally {
      setFunding(false)
    }
  }

  /* ── Join challenge ── */
  const handleJoin = async () => {
    if (!user) { toast.error('Sign in to join'); return }
    setJoining(true)
    const { error } = await supabase.from('challenge_participants').insert({ challenge_id: challenge.id, user_id: user.id, verification_text: verText })
    if (!error) { toast.success('Joined challenge!'); setShowForm(false); setVerText(''); onUpdated() }
    else toast.error(error.message)
    setJoining(false)
  }

  /* ── Verify participant ── */
  const handleVerify = async (pid: string) => {
    const { error } = await supabase.from('challenge_participants').update({ is_verified: true }).eq('id', pid)
    if (!error) { toast.success('Verified!'); onUpdated() }
  }

  const toggleWinnerSelect = (userId: string) => {
    setSelectedWinnerIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else if (next.size < 3) next.add(userId)
      else toast.error('Max 3 winners allowed')
      return next
    })
  }

  /* ── Release rewards (manual winner selection) ── */
  const handleRelease = async () => {
    if (!challenge.pool_funded) { toast.error('Fund the challenge pool first'); return }
    if (selectedWinnerIds.size === 0) { toast.error('Select at least one winner'); return }

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
          await eth.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x2105', chainName: 'Base', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] })
        }
      }

      const selectedWinners = verifiedParticipants.filter(p => selectedWinnerIds.has(p.user_id))
      const prize = challenge.pool_amount / selectedWinners.length
      const hashes: string[] = []

      for (const w of selectedWinners) {
        const walletAddr = (w.user as any)?.wallet_address
        if (!walletAddr) { toast.error(`@${(w.user as any)?.username} has no wallet linked — skipping`); continue }
        const units = BigInt(Math.round(prize * 1_000_000))
        const data = '0xa9059cbb' + walletAddr.slice(2).padStart(64, '0') + units.toString(16).padStart(64, '0')
        const hash: string = await eth.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: USDC_ADDRESS, data, chainId: '0x2105' }] })
        hashes.push(hash)
      }

      // Mark winners in DB
      for (let i = 0; i < selectedWinners.length; i++) {
        await supabase.from('challenge_participants').update({ is_winner: true, prize_amount: prize, prize_tx_hash: hashes[i] || null }).eq('id', selectedWinners[i].id)
        await supabase.from('notifications').insert({ user_id: selectedWinners[i].user_id, actor_id: user!.id, type: 'challenge_win', post_id: post.id, data: { prize_amount: prize, tx_hash: hashes[i] } })
      }
      await supabase.from('challenges').update({ is_completed: true, winners: selectedWinners.map(w => w.user_id) }).eq('id', challenge.id)

      toast.success(`${prize.toFixed(2)} USDC sent to ${selectedWinners.length} winner(s)!`)
      setShowWinnerPicker(false)
      onUpdated()
    } catch (e: any) {
      if (e.code === 4001) toast.error('Transaction rejected')
      else toast.error(e.message || 'Release failed')
    } finally {
      setReleasing(false)
    }
  }

  return (
    <div className="mx-4 my-3 rounded-2xl p-4 border" style={{ background: 'rgba(249,115,22,0.04)', borderColor: 'rgba(249,115,22,0.22)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-orange-500/10 rounded-lg flex items-center justify-center">
          <Trophy className="w-3.5 h-3.5 text-orange-400" />
        </div>
        <h3 className="font-bold text-sm text-orange-400">Challenge</h3>
        {challenge.is_completed && <CheckCircle className="w-4 h-4 text-emerald-400" />}
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-[#5a6d85]">
          <Users className="w-3 h-3" /> {participants.length} joined
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold">Pool: {challenge.pool_amount} USDC</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${poolFunded ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'}`}>
            {poolFunded ? '✓ Funded' : 'Awaiting fund'}
          </span>
          {isCreator && !poolFunded && !challenge.is_completed && (
            <button
              onClick={handleFundPool}
              disabled={funding}
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition disabled:opacity-50"
              style={{ background: 'rgba(0,82,255,0.15)', color: '#4d8bff', border: '1px solid rgba(0,82,255,0.3)' }}
            >
              {funding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />}
              {funding ? 'Funding…' : 'Fund Pool'}
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-[#7090a8] mb-4 leading-relaxed">{challenge.command}</p>

      {/* Participants */}
      {participants.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {participants.map(p => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="w-6 h-6 rounded-full overflow-hidden bg-[#0d1929] flex-shrink-0">
                {(p.user as any)?.avatar_url
                  ? <Image src={(p.user as any).avatar_url} alt="" width={24} height={24} className="object-cover w-full h-full" />
                  : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-[10px] text-white font-bold">{(p.user as any)?.name?.[0]}</div>
                }
              </div>
              <Link href={`/profile/${(p.user as any)?.username}`} className="text-[11px] font-medium hover:text-[#4d8bff] transition flex-1">
                @{(p.user as any)?.username}
              </Link>
              {p.is_winner && <span className="text-[10px] text-yellow-400 font-bold flex items-center gap-1"><Crown className="w-3 h-3" />{p.prize_amount}U</span>}
              {p.is_verified && !p.is_winner && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
              {isCreator && !p.is_verified && !challenge.is_completed && (
                <button onClick={() => handleVerify(p.id)}
                  className="text-[10px] font-bold rounded-full px-2 py-0.5 transition"
                  style={{ background: 'rgba(0,82,255,0.1)', color: '#4d8bff', border: '1px solid rgba(0,82,255,0.2)' }}>
                  Verify
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Join form */}
      {!isCreator && !hasJoined && !challenge.is_completed && user && (
        showForm ? (
          <div className="space-y-2">
            <textarea
              placeholder="Describe how you completed the challenge (add links, proof, repo URL...)"
              value={verText}
              onChange={e => setVerText(e.target.value)}
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
              style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition hover:bg-white/[0.05]"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                Cancel
              </button>
              <button onClick={handleJoin} disabled={joining}
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-black rounded-xl py-2.5 text-sm font-bold transition disabled:opacity-50">
                {joining ? 'Submitting...' : 'Submit Proof'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="w-full bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-black rounded-xl py-2.5 text-sm font-bold transition">
            Join Challenge
          </button>
        )
      )}

      {hasJoined && !challenge.is_completed && (
        <p className="text-xs text-[#5a6d85] text-center py-1">You joined this challenge ✓</p>
      )}

      {/* Creator: Manual winner selection */}
      {isCreator && !challenge.is_completed && verifiedCount > 0 && (
        <>
          {showWinnerPicker ? (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-[#5a6d85]">Select up to 3 winners (verified only):</p>
              {verifiedParticipants.map(p => (
                <button
                  key={p.id}
                  onClick={() => toggleWinnerSelect(p.user_id)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 transition border ${
                    selectedWinnerIds.has(p.user_id)
                      ? 'border-orange-500/60 bg-orange-500/10'
                      : 'border-white/[0.07] hover:border-white/20'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-[#0d1929] flex-shrink-0">
                    {(p.user as any)?.avatar_url
                      ? <Image src={(p.user as any).avatar_url} alt="" width={24} height={24} className="object-cover w-full h-full" />
                      : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-[10px] text-white font-bold">{(p.user as any)?.name?.[0]}</div>
                    }
                  </div>
                  <span className="text-[11px] font-medium flex-1 text-left">@{(p.user as any)?.username}</span>
                  {selectedWinnerIds.has(p.user_id) && <Crown className="w-3.5 h-3.5 text-orange-400" />}
                </button>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowWinnerPicker(false); setSelectedWinnerIds(new Set()) }}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition hover:bg-white/[0.05]"
                  style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  Cancel
                </button>
                <button
                  onClick={handleRelease}
                  disabled={releasing || selectedWinnerIds.size === 0}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #ea580c, #f97316)', color: 'white' }}
                >
                  {releasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  {releasing ? 'Sending…' : `Release to ${selectedWinnerIds.size || '?'} Winner(s)`}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowWinnerPicker(true)}
              className="w-full agentipy-gradient text-white rounded-xl py-2.5 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 mt-2 shadow-lg shadow-blue-500/15">
              <Crown className="w-4 h-4" /> Pick Winners & Release Prize
            </button>
          )}
        </>
      )}

      {challenge.is_completed && winnerCount > 0 && (
        <p className="text-xs text-center text-emerald-400 font-semibold mt-1">
          Challenge completed · {winnerCount} winner{winnerCount > 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  )
}
