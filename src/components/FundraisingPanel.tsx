'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { TrendingUp, CheckCircle, ExternalLink, Heart, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const PRESET_AMOUNTS = [5, 10, 25, 50]
const MIN_DONATE = 1

export function FundraisingPanel({ post, onDonated }: { post: Post; onDonated: () => void }) {
  const { user } = useAuth()
  const [selectedAmt, setSelectedAmt] = useState(10)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [localRaised, setLocalRaised] = useState<number | null>(null)

  const fr = post.fundraising!
  const finalAmount = custom ? parseFloat(custom) : selectedAmt
  const raised = localRaised ?? fr.raised_amount
  const progress = Math.min(100, (raised / fr.goal_amount) * 100)
  const isGoalReached = raised >= fr.goal_amount

  // Fallback to author wallet if fundraising has no dedicated wallet
  const recipientWallet = fr.wallet_address || post.author?.wallet_address

  const handleDonate = async () => {
    if (!user) { toast.error('Sign in to donate'); return }
    if (!recipientWallet) { toast.error('No wallet address for this fundraising'); return }
    if (!finalAmount || finalAmount < MIN_DONATE) { toast.error(`Minimum donation is $${MIN_DONATE} USDC`); return }
    if (finalAmount > 100000) { toast.error('Maximum donation is $100,000 USDC'); return }

    setLoading(true)
    try {
      if (!(window as any).ethereum) { toast.error('No wallet detected. Install MetaMask.'); setLoading(false); return }
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

      const units = BigInt(Math.round(finalAmount * 1_000_000))
      const data = '0xa9059cbb' + recipientWallet.slice(2).padStart(64, '0') + units.toString(16).padStart(64, '0')
      const hash: string = await eth.request({ method: 'eth_sendTransaction', params: [{ from: accounts[0], to: USDC_ADDRESS, data, chainId: '0x2105' }] })
      setTxHash(hash)

      const newRaised = raised + finalAmount
      setLocalRaised(newRaised)
      await supabase.from('fundraisings').update({ raised_amount: newRaised }).eq('id', fr.id)

      if (user.id !== post.author_id) {
        await supabase.from('notifications').insert({ user_id: post.author_id, actor_id: user.id, type: 'fundraising', post_id: post.id, data: { amount: finalAmount, tx_hash: hash } })
      }

      toast.success(`Donated ${finalAmount} USDC onchain!`)
      setCustom('')
      onDonated()
    } catch (e: any) {
      if (e.code === 4001) toast.error('Transaction rejected')
      else if (e.code === -32603) toast.error('Insufficient USDC balance or gas')
      else toast.error(e.message || 'Donation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-4 my-3 rounded-2xl p-4 border" style={{ background: 'rgba(16,185,129,0.04)', borderColor: 'rgba(16,185,129,0.22)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center">
          {isGoalReached ? <PartyPopper className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
        </div>
        <h3 className="font-bold text-sm text-emerald-400 flex-1 truncate">{fr.title}</h3>
        {fr.is_completed && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
      </div>

      <p className="text-xs text-[#7090a8] mb-3 leading-relaxed">{fr.reason}</p>

      {/* Progress */}
      <div className="flex justify-between text-xs mb-1.5">
        <span className="font-semibold text-white">{raised.toFixed(0)} USDC raised</span>
        <span className="text-[#5a6d85]">Goal: {fr.goal_amount} USDC</span>
      </div>
      <div className="w-full rounded-full h-2 overflow-hidden mb-1" style={{ background: '#0d1929' }}>
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${progress}%`, background: isGoalReached ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#059669,#34d399)' }}
        />
      </div>
      <p className="text-[10px] text-[#5a6d85] mb-4">
        {isGoalReached ? '🎉 Goal reached!' : `${progress.toFixed(1)}% funded`} · Funds go directly to creator&apos;s wallet
      </p>

      {/* Donate section */}
      {!fr.is_completed && user && user.id !== post.author_id && (
        <div className="space-y-2.5">
          {/* Preset amounts */}
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_AMOUNTS.map(a => (
              <button key={a}
                onClick={() => { setSelectedAmt(a); setCustom('') }}
                className={`py-2 rounded-xl text-xs font-bold border transition ${
                  selectedAmt === a && !custom
                    ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10'
                    : 'border-white/[0.07] text-[#5a6d85] hover:border-white/20 hover:text-white'
                }`}
              >${a}</button>
            ))}
          </div>

          {/* Custom + donate button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6d85] text-xs font-bold">$</span>
              <input
                type="number"
                placeholder={`Custom (min $${MIN_DONATE})`}
                value={custom}
                onChange={e => setCustom(e.target.value)}
                min={MIN_DONATE}
                step="1"
                className="w-full rounded-xl pl-6 pr-12 py-2.5 text-sm font-medium outline-none"
                style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#5a6d85] font-semibold">USDC</span>
            </div>
            <button
              onClick={handleDonate}
              disabled={loading || !finalAmount || finalAmount < MIN_DONATE}
              className="bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Heart className="w-3.5 h-3.5" />}
              {loading ? '...' : 'Donate'}
            </button>
          </div>
        </div>
      )}

      {txHash && (
        <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold hover:underline">
          View transaction <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}
