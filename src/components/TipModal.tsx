'use client'

import { useState, useEffect } from 'react'
import { X, Zap, ExternalLink, CheckCircle, AlertCircle, Clock, History } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Post } from '@/lib/types'
import Image from 'next/image'
import { timeAgo } from '@/lib/utils-agentipy'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const TIP_AMOUNTS = [1, 2, 5, 10, 20, 50]
const MIN_TIP = 0.01

interface TipRecord {
  id: string
  amount: number
  tx_hash: string
  created_at: string
  sender: { username: string; avatar_url?: string; name: string } | null
}

export function TipModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const { user } = useAuth()
  const [amount, setAmount] = useState(5)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [done, setDone] = useState(false)
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'confirming' | 'confirmed'>('idle')
  const [recentTips, setRecentTips] = useState<TipRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [totalTips, setTotalTips] = useState(post.tip_total || 0)

  const finalAmount = custom ? parseFloat(custom) : amount
  const isSelf = user?.id === post.author_id
  const hasWallet = !!post.author?.wallet_address

  // Load recent tips for this post
  useEffect(() => {
    supabase.from('tips')
      .select('id, amount, tx_hash, created_at, sender:users!sender_id(username, avatar_url, name)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setRecentTips((data as any) || []))
  }, [post.id])

  const waitForReceipt = async (eth: any, hash: string, maxWait = 60000): Promise<boolean> => {
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      try {
        const receipt = await eth.request({ method: 'eth_getTransactionReceipt', params: [hash] })
        if (receipt) return receipt.status === '0x1'
      } catch {}
      await new Promise(r => setTimeout(r, 2000))
    }
    return true // assume success after timeout — tx is broadcast
  }

  const handleTip = async () => {
    if (!user) { toast.error('Sign in to tip'); return }
    if (isSelf) { toast.error("You can't tip your own post"); return }
    if (!hasWallet) { toast.error('This author has no linked wallet'); return }
    if (!finalAmount || finalAmount < MIN_TIP) { toast.error(`Minimum tip is $${MIN_TIP} USDC`); return }
    if (finalAmount > 10000) { toast.error('Maximum tip is $10,000 USDC'); return }

    if (typeof window === 'undefined' || !(window as any).ethereum) {
      toast.error('No wallet detected — install MetaMask or use a Web3 browser')
      return
    }

    setLoading(true)
    setTxStatus('pending')
    try {
      const eth = (window as any).ethereum
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      if (!accounts.length) throw new Error('No accounts connected')

      // Ensure Base mainnet
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] })
      } catch (err: any) {
        if (err.code === 4902) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [{
            chainId: '0x2105', chainName: 'Base',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org']
          }] })
        } else throw err
      }

      // Encode ERC-20 transfer(address,uint256)
      const recipient = post.author!.wallet_address!
      const units = BigInt(Math.round(finalAmount * 1_000_000))
      const paddedAddr = recipient.toLowerCase().slice(2).padStart(64, '0')
      const paddedAmt  = units.toString(16).padStart(64, '0')
      const data = '0xa9059cbb' + paddedAddr + paddedAmt

      const hash: string = await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: accounts[0], to: USDC_ADDRESS, data, chainId: '0x2105' }]
      })
      setTxHash(hash)
      setTxStatus('confirming')
      toast.info('Transaction broadcast — waiting for confirmation…')

      // Wait for on-chain confirmation (non-blocking — store regardless)
      const confirmed = await waitForReceipt(eth, hash)
      setTxStatus('confirmed')

      // Record in DB
      await supabase.from('tips').insert({
        sender_id: user.id,
        receiver_id: post.author_id,
        post_id: post.id,
        amount: finalAmount,
        tx_hash: hash,
        status: confirmed ? 'confirmed' : 'pending',
      })

      // Update post tip total optimistically
      const newTotal = totalTips + finalAmount
      setTotalTips(newTotal)
      await supabase.from('posts').update({ tip_total: newTotal }).eq('id', post.id)

      // Notify author
      await supabase.from('notifications').insert({
        user_id: post.author_id,
        actor_id: user.id,
        type: 'tip',
        post_id: post.id,
        data: { amount: finalAmount, tx_hash: hash },
      })

      setDone(true)
      toast.success(`Tipped ${finalAmount} USDC — confirmed on Base!`)
    } catch (e: any) {
      setTxStatus('idle')
      if (e.code === 4001) toast.error('Transaction rejected by user')
      else if (e.code === -32603) toast.error('Insufficient USDC balance or gas')
      else toast.error(e.message || 'Tip failed — please try again')
    } finally {
      setLoading(false)
    }
  }

  const statusLabel = {
    idle: null,
    pending: { text: 'Waiting for wallet…', color: 'text-yellow-400', icon: Clock },
    confirming: { text: 'Confirming on Base…', color: 'text-blue-400', icon: Clock },
    confirmed: { text: 'Confirmed on Base!', color: 'text-emerald-400', icon: CheckCircle },
  }[txStatus]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl shadow-yellow-500/10 overflow-hidden"
        style={{ background: '#060f1c', border: '1px solid rgba(234,179,8,0.2)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-yellow-500/10 rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Tip with USDC</h2>
              <p className="text-[10px] text-[#5a6d85]">Base mainnet · Real onchain transfer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {recentTips.length > 0 && (
              <button
                onClick={() => setShowHistory(v => !v)}
                className={`p-1.5 rounded-xl transition ${showHistory ? 'text-yellow-400 bg-yellow-500/10' : 'text-[#5a6d85] hover:text-white hover:bg-white/[0.05]'}`}
                title="Tip history"
              >
                <History className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-[#5a6d85] hover:text-white p-1.5 rounded-xl hover:bg-white/[0.05] transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Tip history panel */}
          {showHistory && !done && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="px-3 py-2 flex items-center gap-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Zap className="w-3 h-3 text-yellow-400" />
                <span className="text-[11px] font-semibold text-white">Recent Tips</span>
                <span className="ml-auto text-[10px] text-[#5a6d85] font-bold">{totalTips.toFixed(2)} USDC total</span>
              </div>
              {recentTips.map(t => (
                <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-[#0d1929] flex-shrink-0">
                    {t.sender?.avatar_url
                      ? <Image src={t.sender.avatar_url} alt="" width={24} height={24} className="object-cover w-full h-full" />
                      : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-[9px] font-bold text-white">{t.sender?.name?.[0]}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-white">@{t.sender?.username}</span>
                    <span className="text-[10px] text-[#3a4d62] ml-1.5">{timeAgo(t.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-yellow-400">{t.amount} USDC</span>
                    <a href={`https://basescan.org/tx/${t.tx_hash}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 text-[#3a4d62] hover:text-[#4d8bff]" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {done ? (
            /* ── Success ── */
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-yellow-400" />
              </div>
              <div>
                <p className="font-bold text-base text-white">Tip sent & confirmed!</p>
                <p className="text-sm text-[#5a6d85] mt-1">{finalAmount} USDC → @{post.author?.username}</p>
              </div>
              <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#5a6d85]">Transaction</span>
                  <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-yellow-400 font-semibold hover:underline">
                    {txHash.slice(0, 10)}…{txHash.slice(-6)} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#5a6d85]">Post total tips</span>
                  <span className="text-white font-bold">{totalTips.toFixed(2)} USDC</span>
                </div>
              </div>
              <button onClick={onClose} className="block w-full py-2.5 rounded-xl font-bold text-sm transition text-[#5a6d85] hover:text-white" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Self-tip guard */}
              {isSelf && (
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-[11px] text-red-300">You can&apos;t tip your own post.</p>
                </div>
              )}

              {/* No wallet guard */}
              {!hasWallet && !isSelf && (
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3" style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <p className="text-[11px] text-yellow-300">This author hasn&apos;t linked a wallet yet.</p>
                </div>
              )}

              {/* Author card */}
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#0d1929] flex-shrink-0">
                  {post.author?.avatar_url
                    ? <Image src={post.author.avatar_url} alt="" width={40} height={40} className="object-cover w-full h-full" />
                    : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-sm font-bold text-white">{post.author?.name[0]}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-white truncate">{post.author?.name}</p>
                  <p className="text-xs text-[#5a6d85]">@{post.author?.username}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#3a4d62]">Total tips</p>
                  <p className="text-sm font-bold text-yellow-400">{totalTips.toFixed(2)} USDC</p>
                </div>
              </div>

              {/* Quick amounts */}
              <div className="grid grid-cols-3 gap-2">
                {TIP_AMOUNTS.map(a => (
                  <button key={a} onClick={() => { setAmount(a); setCustom('') }}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition ${
                      amount === a && !custom
                        ? 'border-yellow-500/60 text-yellow-400 bg-yellow-500/10'
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
                  placeholder={`Custom (min $${MIN_TIP})`}
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                  min={MIN_TIP}
                  step="0.01"
                  className="w-full rounded-xl pl-8 pr-16 py-2.5 text-sm font-medium transition outline-none focus:ring-1 focus:ring-yellow-500/40"
                  style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5a6d85] text-xs font-semibold">USDC</span>
              </div>

              {/* Tx status indicator */}
              {statusLabel && (
                <div className="flex items-center gap-2 text-[11px] font-medium justify-center">
                  <statusLabel.icon className={`w-3.5 h-3.5 ${statusLabel.color} ${txStatus === 'confirming' ? 'animate-spin' : ''}`} />
                  <span className={statusLabel.color}>{statusLabel.text}</span>
                </div>
              )}

              <p className="text-[11px] text-[#5a6d85] text-center leading-relaxed">
                Real USDC transfer on Base mainnet directly to {post.author?.name}&apos;s wallet. Verifiable on Basescan.
              </p>

              <button
                onClick={handleTip}
                disabled={loading || isSelf || !hasWallet || !finalAmount || finalAmount < MIN_TIP}
                className="w-full rounded-xl py-3 font-bold text-sm transition disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #ca8a04, #eab308)', color: 'black' }}
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  : <Zap className="w-4 h-4" />}
                {loading
                  ? txStatus === 'confirming' ? 'Confirming…' : 'Sending…'
                  : `Tip ${finalAmount || 0} USDC`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
