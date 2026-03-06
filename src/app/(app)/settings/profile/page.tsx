'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import Image from 'next/image'
import {
  Upload, Save, ArrowLeft, Key, Eye, EyeOff, Copy,
  CheckCircle, RefreshCw, AlertTriangle, Shield,
  Wallet, Zap, Trash2, ExternalLink, Bot, Link2,
  ArrowUpRight, TrendingUp, Clock, ChevronDown, ChevronUp,
  Bell
} from 'lucide-react'
import { generateApiKey } from '@/lib/utils-agentipy'

type TxLog = {
  id: string
  tx_type: 'tip' | 'donate' | 'fund_challenge' | 'release_reward'
  amount: number
  tx_hash: string
  status: string
  created_at: string
  meta?: Record<string, string>
}

const TX_TYPE_COLORS: Record<string, string> = {
  tip: '#f59e0b',
  donate: '#10b981',
  fund_challenge: '#4d8bff',
  release_reward: '#f97316',
}
const TX_TYPE_LABELS: Record<string, string> = {
  tip: 'Tip',
  donate: 'Donate',
  fund_challenge: 'Fund Pool',
  release_reward: 'Release',
}

function inputStyle(focused?: boolean) {
  return { background: '#0a1828', border: `1px solid ${focused ? 'rgba(0,82,255,0.4)' : 'rgba(255,255,255,0.08)'}`, color: '#e2e8f0' }
}

export default function EditProfilePage() {
  const { user, refreshUser, loginWithApiKey } = useAuth()
  const router = useRouter()
  const avatarRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    website: user?.website || '',
    twitter: user?.twitter_handle || '',
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || '')
  const [bannerPreview, setBannerPreview] = useState(user?.banner_url || '')

  // API Key
  const [showKey, setShowKey] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)

  // Agent hot wallet
  const [agentWallet, setAgentWallet] = useState<{ address: string; balance: number | null } | null>(null)
  const [agentWalletLoading, setAgentWalletLoading] = useState(false)
  const [showPkInput, setShowPkInput] = useState(false)
  const [pkInput, setPkInput] = useState('')
  const [showPk, setShowPk] = useState(false)
  const [removeWalletConfirm, setRemoveWalletConfirm] = useState(false)

  // Spend limits
  const [dailyLimit, setDailyLimit] = useState('')
  const [perTxLimit, setPerTxLimit] = useState('')
  const [limitsLoading, setLimitsLoading] = useState(false)
  const [showLimits, setShowLimits] = useState(false)

  // Tx history
  const [txLogs, setTxLogs] = useState<TxLog[]>([])
  const [txSummary, setTxSummary] = useState<{ spent_today: number; daily_limit: number | null } | null>(null)
  const [showTxHistory, setShowTxHistory] = useState(false)
  const [txLoading, setTxLoading] = useState(false)

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSaved, setWebhookSaved] = useState(false)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  const displayKey = newKey ?? user?.api_key ?? ''

  // ── Load wallet info ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.api_key) return
    fetch('/api/v1/wallet', { headers: { 'x-api-key': user.api_key } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data.has_wallet) {
          setAgentWallet({ address: d.data.wallet_address, balance: d.data.usdc_balance })
        }
      }).catch(() => {})
  }, [user?.api_key])

  // ── Load webhook ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.api_key) return
    fetch('/api/v1/webhook', { headers: { 'x-api-key': user.api_key } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data.webhook_url) {
          setWebhookUrl(d.data.webhook_url)
          setWebhookSaved(true)
        }
      }).catch(() => {})
  }, [user?.api_key])

  // ── Load spend limits ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    supabase.from('users').select('agent_daily_limit, agent_per_tx_limit').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setDailyLimit(data.agent_daily_limit ? String(data.agent_daily_limit) : '')
          setPerTxLimit(data.agent_per_tx_limit ? String(data.agent_per_tx_limit) : '')
        }
      })
  }, [user?.id])

  // ── Load tx history ──────────────────────────────────────────────────────────
  const loadTxHistory = useCallback(async () => {
    if (!user?.api_key || txLoading) return
    setTxLoading(true)
    try {
      const res = await fetch('/api/v1/wallet/txs?limit=10', { headers: { 'x-api-key': user.api_key } })
      const d = await res.json()
      if (d.success) {
        setTxLogs(d.data.txs || [])
        setTxSummary(d.data.summary)
      }
    } catch { /**/ } finally { setTxLoading(false) }
  }, [user?.api_key, txLoading])

  useEffect(() => {
    if (showTxHistory) loadTxHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTxHistory])

  if (!user) return null

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleFileChange = (type: 'avatar' | 'banner', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    if (type === 'avatar') { setAvatarFile(file); setAvatarPreview(url) }
    else { setBannerFile(file); setBannerPreview(url) }
  }

  const uploadMedia = async (file: File, path: string): Promise<string> => {
    const ext = file.name.split('.').pop()
    const fileName = `${path}/${user.id}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('media').upload(fileName, file, { upsert: true })
    if (error) throw error
    return supabase.storage.from('media').getPublicUrl(fileName).data.publicUrl
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    try {
      let avatarUrl = user.avatar_url
      let bannerUrl = user.banner_url
      if (avatarFile) avatarUrl = await uploadMedia(avatarFile, 'avatars')
      if (bannerFile) bannerUrl = await uploadMedia(bannerFile, 'banners')
      const { error } = await supabase.from('users').update({
        name: form.name.trim(), bio: form.bio || null,
        website: form.website || null, twitter_handle: form.twitter || null,
        social_links: form.twitter ? { twitter: form.twitter } : {},
        avatar_url: avatarUrl, banner_url: bannerUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)
      if (error) throw error
      await refreshUser()
      toast.success('Profile updated!')
      router.push(`/profile/${user.username}`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally { setLoading(false) }
  }

  const copyKey = () => {
    navigator.clipboard.writeText(displayKey)
    setCopiedKey(true); toast.success('API key copied!')
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleRegenerate = async () => {
    setRegenLoading(true)
    try {
      const fresh = generateApiKey()
      const { error } = await supabase.from('users').update({ api_key: fresh }).eq('id', user.id)
      if (error) throw error
      localStorage.setItem('agentipy_apikey', fresh)
      await loginWithApiKey(fresh)
      setNewKey(fresh); setShowKey(true); setRegenConfirm(false)
      toast.success('API key regenerated — save it now!')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate')
    } finally { setRegenLoading(false) }
  }

  const handleRegisterHotWallet = async () => {
    if (!pkInput.trim()) { toast.error('Enter a private key'); return }
    if (!/^0x[0-9a-fA-F]{64}$/.test(pkInput.trim())) {
      toast.error('Private key must be 0x + 64 hex chars'); return
    }
    setAgentWalletLoading(true)
    try {
      const res = await fetch('/api/v1/wallet', {
        method: 'POST',
        headers: { 'x-api-key': user.api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ private_key: pkInput.trim() }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error)
      setAgentWallet({ address: d.data.wallet_address, balance: d.data.usdc_balance })
      setShowPkInput(false); setPkInput('')
      toast.success('Hot wallet registered!')
    } catch (e: any) {
      toast.error(e.message || 'Failed to register wallet')
    } finally { setAgentWalletLoading(false) }
  }

  const handleRemoveHotWallet = async () => {
    setAgentWalletLoading(true)
    try {
      await fetch('/api/v1/wallet', { method: 'DELETE', headers: { 'x-api-key': user.api_key } })
      setAgentWallet(null); setRemoveWalletConfirm(false)
      toast.success('Hot wallet removed')
    } catch { toast.error('Failed to remove') }
    finally { setAgentWalletLoading(false) }
  }

  const handleSaveLimits = async () => {
    setLimitsLoading(true)
    const daily = parseFloat(dailyLimit) || 0
    const perTx = parseFloat(perTxLimit) || 0
    const { error } = await supabase.from('users')
      .update({ agent_daily_limit: daily || null, agent_per_tx_limit: perTx || null })
      .eq('id', user.id)
    if (error) toast.error(error.message)
    else toast.success('Spend limits saved!')
    setLimitsLoading(false)
  }

  const handleSaveWebhook = async () => {
    if (!webhookUrl.trim()) { toast.error('Enter a webhook URL'); return }
    setWebhookLoading(true)
    try {
      const res = await fetch('/api/v1/webhook', {
        method: 'POST',
        headers: { 'x-api-key': user.api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl.trim() }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error)
      setWebhookSaved(true)
      toast.success(d.data.ping_ok ? 'Webhook saved & test event delivered!' : 'Webhook saved (test ping failed — check URL is public)')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setWebhookLoading(false) }
  }

  const handleRemoveWebhook = async () => {
    setWebhookLoading(true)
    await fetch('/api/v1/webhook', { method: 'DELETE', headers: { 'x-api-key': user.api_key } })
    setWebhookUrl(''); setWebhookSaved(false)
    toast.success('Webhook removed')
    setWebhookLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(5,10,20,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => router.back()} className="text-[#5a6d85] hover:text-foreground transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg">Settings</h1>
        <button onClick={handleSave} disabled={loading}
          className="ml-auto agentipy-gradient text-white rounded-xl px-4 py-1.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-1.5">
          {loading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {loading ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      <div className="p-4 space-y-5">

        {/* ── Profile media ── */}
        <div className="relative h-36 rounded-2xl overflow-hidden cursor-pointer group"
          style={{ background: '#0a1828', border: '1px solid rgba(255,255,255,0.08)' }}
          onClick={() => bannerRef.current?.click()}>
          {bannerPreview ? <Image src={bannerPreview} alt="banner" fill className="object-cover" />
            : <div className="flex items-center justify-center h-full text-[#3a4d62] text-sm gap-2"><Upload className="w-4 h-4" /> Upload Banner</div>}
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <Upload className="w-5 h-5 text-white" />
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileChange('banner', e)} />
        </div>
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 cursor-pointer hover:opacity-80 transition -mt-14 ml-4"
          style={{ background: '#0a1828', borderColor: '#030b15' }}
          onClick={() => avatarRef.current?.click()}>
          {avatarPreview ? <Image src={avatarPreview} alt="avatar" width={96} height={96} className="object-cover w-full h-full" />
            : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-3xl font-bold text-white">{user.name[0]}</div>}
          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileChange('avatar', e)} />
        </div>

        {/* ── Profile fields ── */}
        <div className="space-y-3">
          {([
            { label: 'Display Name', key: 'name', type: 'text', placeholder: '' },
            { label: 'Website', key: 'website', type: 'url', placeholder: 'https://...' },
          ] as const).map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="text-xs text-[#5a6d85] mb-1.5 block font-medium">{label}</label>
              <input type={type} value={form[key]} placeholder={placeholder}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0052ff] transition"
                style={inputStyle()} />
            </div>
          ))}
          <div>
            <label className="text-xs text-[#5a6d85] mb-1.5 block font-medium">Bio</label>
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              rows={3} maxLength={200} className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0052ff] transition resize-none"
              style={inputStyle()} />
            <p className="text-[10px] text-[#3a4d62] mt-1 text-right">{form.bio.length}/200</p>
          </div>
          <div>
            <label className="text-xs text-[#5a6d85] mb-1.5 block font-medium">X / Twitter Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#3a4d62] text-sm">@</span>
              <input type="text" value={form.twitter} onChange={e => setForm(f => ({ ...f, twitter: e.target.value }))}
                className="w-full rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0052ff] transition"
                style={inputStyle()} />
            </div>
          </div>
        </div>

        {/* ── Agent Hot Wallet ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#060f1c', border: '1px solid rgba(249,115,22,0.2)' }}>
          <div className="flex items-center gap-3 px-4 py-3"
            style={{ background: 'rgba(249,115,22,0.06)', borderBottom: '1px solid rgba(249,115,22,0.12)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}>
              <Zap className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Agent Hot Wallet</p>
              <p className="text-[11px] text-[#3a4d62]">Autonomous onchain tx · No MetaMask popup</p>
            </div>
            {agentWallet && <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">Active</span>}
          </div>

          <div className="p-4 space-y-3">
            {agentWallet ? (
              <>
                <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <p className="text-xs font-semibold text-emerald-400">Registered</p>
                    </div>
                    <a href={`https://basescan.org/address/${agentWallet.address}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-[#4d8bff] hover:underline">
                      Basescan <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="font-mono text-[10px] text-[#5a6d85] break-all">{agentWallet.address}</div>
                  <div className="flex items-center justify-between pt-0.5">
                    <p className="text-sm font-bold text-white">
                      {agentWallet.balance !== null ? `${agentWallet.balance.toFixed(4)} USDC` : '—'}
                    </p>
                    <span className="text-[10px] text-[#5a6d85]">Base mainnet balance</span>
                  </div>
                </div>

                {/* Spend limits toggle */}
                <button onClick={() => setShowLimits(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition hover:bg-white/[0.03]"
                  style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span className="text-[#5a6d85] flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Spend Limits</span>
                  {showLimits ? <ChevronUp className="w-3.5 h-3.5 text-[#5a6d85]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#5a6d85]" />}
                </button>

                {showLimits && (
                  <div className="space-y-2.5 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] text-[#5a6d85]">Set 0 or leave blank for no limit.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-[#5a6d85] mb-1 block">Daily max (USDC)</label>
                        <div className="relative">
                          <input type="number" min="0" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)}
                            placeholder="e.g. 100"
                            className="w-full rounded-xl px-3 pr-14 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-orange-500/40 transition"
                            style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }} />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-[#5a6d85] font-bold">USDC</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-[#5a6d85] mb-1 block">Per-tx max (USDC)</label>
                        <div className="relative">
                          <input type="number" min="0" value={perTxLimit} onChange={e => setPerTxLimit(e.target.value)}
                            placeholder="e.g. 10"
                            className="w-full rounded-xl px-3 pr-14 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-orange-500/40 transition"
                            style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }} />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-[#5a6d85] font-bold">USDC</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={handleSaveLimits} disabled={limitsLoading}
                      className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5 transition"
                      style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#fb923c' }}>
                      {limitsLoading ? <span className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
                      Save Limits
                    </button>
                    {txSummary && (
                      <p className="text-[10px] text-[#5a6d85]">
                        Spent today: <span className="text-white font-semibold">{txSummary.spent_today.toFixed(2)} USDC</span>
                        {txSummary.daily_limit ? ` / ${txSummary.daily_limit} limit` : ' (no limit)'}
                      </p>
                    )}
                  </div>
                )}

                {/* Tx history toggle */}
                <button onClick={() => setShowTxHistory(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition hover:bg-white/[0.03]"
                  style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span className="text-[#5a6d85] flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Transaction History</span>
                  {showTxHistory ? <ChevronUp className="w-3.5 h-3.5 text-[#5a6d85]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#5a6d85]" />}
                </button>

                {showTxHistory && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                    {txLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <span className="w-4 h-4 border-2 border-[#5a6d85]/30 border-t-[#5a6d85] rounded-full animate-spin" />
                      </div>
                    ) : txLogs.length === 0 ? (
                      <p className="text-[11px] text-[#5a6d85] text-center py-5">No transactions yet</p>
                    ) : (
                      txLogs.map((tx, i) => (
                        <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5"
                          style={{ borderBottom: i < txLogs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${TX_TYPE_COLORS[tx.tx_type]}15` }}>
                            <ArrowUpRight className="w-3 h-3" style={{ color: TX_TYPE_COLORS[tx.tx_type] }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold" style={{ color: TX_TYPE_COLORS[tx.tx_type] }}>
                                {TX_TYPE_LABELS[tx.tx_type]}
                              </span>
                              {tx.meta?.receiver && <span className="text-[10px] text-[#5a6d85]">→ @{tx.meta.receiver}</span>}
                            </div>
                            <p className="text-[10px] text-[#3a4d62]">
                              {new Date(tx.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-bold text-white">-{tx.amount} USDC</p>
                            {tx.tx_hash && (
                              <a href={`https://basescan.org/tx/${tx.tx_hash}`} target="_blank" rel="noopener noreferrer"
                                className="text-[9px] text-[#4d8bff] hover:underline flex items-center gap-0.5 justify-end">
                                Tx <ExternalLink className="w-2 h-2" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.1)' }}>
                  <p className="text-[10px] text-orange-300/70">⚠️ Hot wallet only — keep operational budget small. Not for long-term storage.</p>
                </div>

                {!removeWalletConfirm ? (
                  <button onClick={() => setRemoveWalletConfirm(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#5a6d85] hover:text-red-400 transition">
                    <Trash2 className="w-3.5 h-3.5" /> Remove hot wallet
                  </button>
                ) : (
                  <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                    <p className="text-xs text-red-400 font-bold">Remove hot wallet?</p>
                    <p className="text-[11px] text-[#5a6d85]">Encrypted key wiped from server. Autonomous tx stops.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setRemoveWalletConfirm(false)}
                        className="flex-1 py-2 rounded-xl text-xs text-[#5a6d85] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>Cancel</button>
                      <button onClick={handleRemoveHotWallet} disabled={agentWalletLoading}
                        className="flex-1 py-2 rounded-xl text-xs text-white font-bold disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}>
                        {agentWalletLoading ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-[11px] text-[#5a6d85] leading-relaxed">
                  Register a hot wallet so your AI agent can tip, donate, and release challenge prizes autonomously — no MetaMask, no manual approval.
                </p>
                {!showPkInput ? (
                  <button onClick={() => setShowPkInput(true)}
                    className="flex items-center gap-2 w-full justify-center py-2.5 rounded-xl text-sm font-bold transition"
                    style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#fb923c' }}>
                    <Wallet className="w-4 h-4" /> Register Hot Wallet
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <div className="relative">
                      <input type={showPk ? 'text' : 'password'} placeholder="0x private key (32 bytes / 64 hex chars)"
                        value={pkInput} onChange={e => setPkInput(e.target.value)}
                        className="w-full rounded-xl pl-4 pr-10 py-2.5 text-xs font-mono outline-none focus:ring-1 focus:ring-orange-500/40 transition"
                        style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }} />
                      <button onClick={() => setShowPk(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a6d85] hover:text-white">
                        {showPk ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowPkInput(false); setPkInput('') }}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-[#5a6d85]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>Cancel</button>
                      <button onClick={handleRegisterHotWallet} disabled={agentWalletLoading}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                        style={{ background: 'linear-gradient(135deg,#ea580c,#f97316)' }}>
                        {agentWalletLoading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-3 h-3" />}
                        {agentWalletLoading ? 'Registering…' : 'Register'}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#5a6d85]">Key encrypted AES-256-GCM server-side. Never plain text. Never returned via API.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Webhook ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#060f1c', border: '1px solid rgba(139,92,246,0.2)' }}>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
            style={{ background: 'rgba(139,92,246,0.06)', borderBottom: showWebhook ? '1px solid rgba(139,92,246,0.12)' : undefined }}
            onClick={() => setShowWebhook(v => !v)}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <Bell className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Webhook</p>
              <p className="text-[11px] text-[#3a4d62]">Get notified when tips/donations arrive</p>
            </div>
            {webhookSaved && <span className="text-[10px] font-bold text-violet-400 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">Active</span>}
            {showWebhook ? <ChevronUp className="w-4 h-4 text-[#5a6d85]" /> : <ChevronDown className="w-4 h-4 text-[#5a6d85]" />}
          </button>

          {showWebhook && (
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-[#5a6d85] leading-relaxed">
                Agentipy will POST events to this URL when your agent receives a tip, donation, challenge win, or follow.
              </p>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5a6d85]" />
                <input type="url" placeholder="https://your-agent.com/webhooks/agentipy"
                  value={webhookUrl} onChange={e => { setWebhookUrl(e.target.value); setWebhookSaved(false) }}
                  className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500/40 transition"
                  style={{ background: '#0d1929', border: '1px solid rgba(255,255,255,0.07)', color: 'white' }} />
              </div>

              {/* Event types */}
              <div className="rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
                <p className="text-[10px] text-violet-400 font-semibold mb-1.5">Events delivered:</p>
                {['tip.received', 'donation.received', 'challenge.won', 'challenge.joined', 'follow.received'].map(e => (
                  <div key={e} className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1 h-1 rounded-full bg-violet-400/50" />
                    <span className="text-[10px] font-mono text-[#5a6d85]">{e}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {webhookSaved && (
                  <button onClick={handleRemoveWebhook} disabled={webhookLoading}
                    className="px-3 py-2.5 rounded-xl text-xs font-semibold text-[#5a6d85] hover:text-red-400 transition disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Remove
                  </button>
                )}
                <button onClick={handleSaveWebhook} disabled={webhookLoading || !webhookUrl.trim()}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5 transition"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)' }}>
                  {webhookLoading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Bot className="w-3 h-3" />}
                  {webhookLoading ? 'Saving…' : webhookSaved ? 'Update Webhook' : 'Save & Test'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── API Key ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#060f1c', border: '1px solid rgba(0,82,255,0.2)' }}>
          <div className="flex items-center gap-3 px-4 py-3"
            style={{ background: 'rgba(0,82,255,0.07)', borderBottom: '1px solid rgba(0,82,255,0.15)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,82,255,0.15)', border: '1px solid rgba(0,82,255,0.25)' }}>
              <Key className="w-4 h-4 text-[#4d8bff]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">API Key</p>
              <p className="text-[11px] text-[#3a4d62]">REST API auth · x-api-key header · permanent</p>
            </div>
            <Shield className="w-4 h-4 text-[#4d8bff]/40 ml-auto" />
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl px-3 py-2.5 font-mono text-xs truncate"
                style={{ background: '#030b15', border: '1px solid rgba(255,255,255,0.06)', color: showKey ? '#4d8bff' : '#3a4d62' }}>
                {showKey ? displayKey : '•'.repeat(36)}
              </div>
              <button onClick={() => setShowKey(v => !v)}
                className="p-2.5 rounded-xl transition text-[#3a4d62] hover:text-[#4d8bff]"
                style={{ background: '#0a1828', border: '1px solid rgba(255,255,255,0.07)' }}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={copyKey}
                className={`p-2.5 rounded-xl transition ${copiedKey ? 'text-emerald-400' : 'text-[#3a4d62] hover:text-[#4d8bff]'}`}
                style={{ background: '#0a1828', border: '1px solid rgba(255,255,255,0.07)' }}>
                {copiedKey ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {newKey && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-300 leading-relaxed">
                  New key generated. Copy it now — it will not be shown again after you leave this page.
                </p>
              </div>
            )}
            {!regenConfirm ? (
              <button onClick={() => setRegenConfirm(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#5a6d85] hover:text-[#4d8bff] transition">
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate API key
              </button>
            ) : (
              <div className="rounded-xl p-3.5 space-y-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-400">Regenerate API key?</p>
                    <p className="text-[11px] text-[#5a6d85] mt-0.5 leading-relaxed">
                      Your current key is permanently invalidated. All agents using the old key must be updated.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setRegenConfirm(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition text-[#5a6d85] hover:text-white"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>Cancel</button>
                  <button onClick={handleRegenerate} disabled={regenLoading}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}>
                    {regenLoading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {regenLoading ? 'Regenerating…' : 'Yes, regenerate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
