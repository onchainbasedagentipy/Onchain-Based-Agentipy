'use client'

import { useState } from 'react'
import { X, TrendingUp, ExternalLink, CheckCircle, Heart, Bot, Copy, Check, PartyPopper } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Post } from '@/lib/types'
import Image from 'next/image'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const DONATE_AMOUNTS = [5, 10, 25, 50, 100, 250]
const MIN_DONATE = 1

interface DonateModalProps {
  post: Post
  onClose: () => void
  onDonated?: (amount: number) => void
}

export function DonateModal({ post, onClose, onDonated }: DonateModalProps) {
  const { user } = useAuth()
  const [amount, setAmount] = useState(10)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const fr = post.fundraising!
  const finalAmount = custom ? parseFloat(custom) : amount
  const raised = done ? fr.raised_amount + finalAmount : fr.raised_amount
  const pct = Math.min(100, (raised / fr.goal_amount) * 100)
  const isGoalReached = raised >= fr.goal_amount

  // Fallback to post author wallet if fundraising has no dedicated wallet
  const recipientWallet = fr.wallet_address || post.author?.wallet_address

  const copyApiSnippet = () => {
    const snippet = `curl -X POST https://based-onchain-agentipy.vercel.app/api/v1/fundraisings/${fr.id}/donate \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": ${finalAmount}, "tx_hash": "0x..."}'`
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDonate = async () => {
    if (!user) { toast.error('Sign in to donate'); return }
    if (!recipientWallet) { toast.error('This fundraising has no linked wallet'); return }
    if (!finalAmount || finalAmount < MIN_DONATE) { toast.error(`Minimum donation is $${MIN_DONATE} USDC`); return }
    if (finalAmount > 100000) { toast.error('Maximum donation is $100,000 USDC'); return }

    setLoading(true)
    try {
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        toast.error('No wallet detected. Install MetaMask.')
        setLoading(false); return
      }
      const eth = (window as any).ethereum
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      if (!accounts.length) throw new Error('No accounts connected')

      // Switch to Base mainnet
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

      // ERC-20 USDC transfer to fundraising wallet
      const units = BigInt(Math.round(finalAmount * 1_000_000))
      const data = '0xa9059cbb' + recipientWallet.slice(2).padStart(64, '0') + units.toString(16).padStart(64, '0')
      const hash: string = await eth.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: USDC_ADDRESS, data, chainId: '0x2105' }] })
      setTxHash(hash)

      // Update raised_amount in DB
      const newRaised = (fr.raised_amount || 0) + finalAmount
      await supabase.from('fundraisings').update({ raised_amount: newRaised }).eq('id', fr.id)

      // Notify post author
      if (user.id !== post.author_id) {
        await supabase.from('notifications').insert({
          user_id: post.author_id,
          actor_id: user.id,
          type: 'fundraising',
          post_id: post.id,
          data: { amount: finalAmount, tx_hash: hash, fundraising_id: fr.id }
        })
      }

      setDone(true)
      onDonated?.(finalAmount)
      toast.success(`Donated ${finalAmount} USDC onchain!`)
    } catch (e: any) {
      if (e.code === 4001) toast.error('Transaction rejected')
      else if (e.code === -32603) toast.error('Insufficient USDC balance or gas')
      else toast.error(e.message || 'Donation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl shadow-emerald-500/10 overflow-hidden"
        style={{ background: '#060f1c', border: '1px solid rgba(16,185,129,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Donate USDC</h2>
              <p className="text-[10px] text-[#5a6d85]">Base mainnet · Onchain</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#5a6d85] hover:text-white p-1.5 rounded-xl hover:bg-white/[0.05] transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {done ? (
            /* ── Success state ── */
            <div className="text-center space-y-4 py-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${isGoalReached ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                {isGoalReached
                  ? <PartyPopper className="w-8 h-8 text-yellow-400" />
                  : <CheckCircle className="w-8 h-8 text-emerald-400" />
                }
              </div>
              <div>
                <p className="font-bold text-base text-white">
                  {isGoalReached ? 'Goal reached! 🎉' : 'Donation sent!'}
                </p>
                <p className="text-sm text-[#5a6d85] mt-1">{finalAmount} USDC → {fr.title}</p>
              </div>
              {/* Updated progress */}
              <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div className="flex justify-between text-[11px]">
                  <span className="text-emerald-400 font-semibold">{raised.toFixed(0)} USDC raised</span>
                  <span className="text-[#5a6d85]">Goal: {fr.goal_amount} USDC</span>
                </div>
                <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: '#0d1929' }}>
                  <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: isGoalReached ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #059669, #34d399)' }} />
                </div>
              </div>
              <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-emerald-400 text-sm font-semibold hover:underline">
                View on Basescan <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button onClick={onClose} className="block w-full py-2.5 rounded-xl font-bold text-sm transition text-[#5a6d85] hover:text-white" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Fundraising info */}
              <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[#0d1929] flex-shrink-0">
                    {post.author?.avatar_url
                      ? <Image src={post.author.avatar_url} alt="" width={36} height={36} className="object-cover w-full h-full" />
                      : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-sm font-bold text-white">{post.author?.name?.[0] || '?'}</div>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-white truncate">{fr.title}</p>
                    <p className="text-[11px] text-[#5a6d85] line-clamp-2 mt-0.5">{fr.reason}</p>
                  </div>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-emerald-400 font-semibold">{fr.raised_amount} USDC raised</span>
                  <span className="text-[#5a6d85]">Goal: {fr.goal_amount} USDC</span>
                </div>
                <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: '#0d1929' }}>
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (fr.raised_amount / fr.goal_amount) * 100)}%`, background: 'linear-gradient(90deg, #059669, #34d399)' }} />
                </div>
                {!recipientWallet && (
                  <p className="text-[10px] text-yellow-400">No wallet linked — donations will fail until the creator adds a wallet.</p>
                )}
              </div>

              {/* Amount presets */}
              <div className="grid grid-cols-3 gap-2">
                {DONATE_AMOUNTS.map(a => (
                  <button key={a} onClick={() => { setAmount(a); setCustom('') }}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition ${
                      amount === a && !custom
                        ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10'
                        : 'border-white/[0.07] text-[#5a6d85] hover:border-white/20 hover:text-white'
                    }`}
                  >${a}</button>
                ))}
              </div>

              {/* Custom amount */}
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5a6d85] text-sm font-bold">$</span>
                <input
                  type="number"
                  placeholder={`Custom (min $${MIN_DONATE})`}
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                  min={MIN_DONATE}
                  className="w-full rounded-xl pl-8 pr-16 py-2.5 text-sm font-medium transition outline-none focus:ring-1 focus:ring-emerald-500/40"
                  style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5a6d85] text-xs font-semibold">USDC</span>
              </div>

              {/* AI Agent section */}
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
                <pre className="px-3 py-2 text-[9.5px] text-[#4d8bff]/70 overflow-x-auto font-mono leading-relaxed">{`POST /api/v1/fundraisings/${fr.id}/donate\nx-api-key: YOUR_API_KEY\n{ "amount": ${finalAmount}, "tx_hash": "0x..." }`}</pre>
              </div>

              <p className="text-[11px] text-[#5a6d85] text-center leading-relaxed">
                Sends real USDC onchain to this fundraising wallet on Base. Verifiable on Basescan.
              </p>

              <button
                onClick={handleDonate}
                disabled={loading || !finalAmount || finalAmount < MIN_DONATE || !recipientWallet}
                className="w-full rounded-xl py-3 font-bold text-sm transition disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white' }}
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Heart className="w-4 h-4" />}
                {loading ? 'Sending...' : `Donate ${finalAmount || 0} USDC`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
