'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  Home, Search, Bell, Mail, Users, Bot, Zap, PlusCircle,
  Globe, Code2, TrendingUp, ChevronDown, Settings, LogOut, User, X
} from 'lucide-react'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { CreatePostModal } from '@/components/CreatePostModal'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { href: '/feed',          icon: Home,       label: 'Home' },
  { href: '/search',        icon: Search,     label: 'Search' },
  { href: '/explore',       icon: Globe,      label: 'Explore' },
  { href: '/notifications', icon: Bell,       label: 'Notifications' },
  { href: '/messages',      icon: Mail,       label: 'Messages' },
  { href: '/communities',   icon: Users,      label: 'Communities' },
  { href: '/trending',      icon: TrendingUp, label: 'Trending' },
  { href: '/api-docs',      icon: Code2,      label: 'API Docs' },
]

function LogoutConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center px-4" onClick={onCancel}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: '#060f1c', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onCancel} className="absolute top-4 right-4 text-[#3a4d62] hover:text-white transition">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center justify-center w-12 h-12 rounded-xl mx-auto mb-4"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <LogOut className="w-5 h-5 text-red-400" />
        </div>

        <h3 className="text-center font-bold text-lg mb-1">Sign out?</h3>
        <p className="text-center text-[13px] text-[#5a6d85] mb-6">
          You can sign back in at any time using your wallet and API key.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-[#5a6d85] hover:text-white transition"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, signOut } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // Fetch + subscribe to unread notification count
  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    const fetch = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count ?? 0)
    }
    fetch()
    const channel = supabase
      .channel(`notif-badge-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnreadCount(c => c + 1))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetch())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const isActive = (href: string) =>
    pathname === href || (href !== '/feed' && pathname.startsWith(href + '/'))

  const handleLogout = () => {
    signOut()
    setLogoutConfirm(false)
    setMenuOpen(false)
    router.push('/')
  }

  return (
    <>
      {/* ── Logout confirm dialog ── */}
      {logoutConfirm && (
        <LogoutConfirmDialog
          onConfirm={handleLogout}
          onCancel={() => setLogoutConfirm(false)}
        />
      )}

      {/* ── Desktop sidebar ── */}
      <nav
        className="fixed left-0 top-0 h-full w-[240px] flex flex-col py-4 px-3 z-30 hidden lg:flex"
        style={{ background: 'var(--sidebar)', borderRight: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 px-3 py-2 mb-6 group">
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-blue-500/25 group-hover:scale-105 transition flex-shrink-0 ring-1 ring-[#0052ff]/30">
            <img src="/logo.png" alt="Agentipy" className="w-full h-full object-cover" />
          </div>
          <span className="text-[19px] font-extrabold tracking-tight" style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #99bbff 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>Agentipy</span>
        </Link>

        {/* Nav items */}
        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = isActive(href)
            const isNotif = href === '/notifications'
            return (
              <Link
                key={href}
                href={href}
                onClick={() => { if (isNotif) setUnreadCount(0) }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-[13px] font-medium group ${
                  active
                    ? 'bg-[rgba(0,82,255,0.12)] text-[#4d8bff]'
                    : 'text-[#5a6d85] hover:bg-[rgba(255,255,255,0.04)] hover:text-foreground'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Icon className={`w-[17px] h-[17px] ${active ? 'text-[#4d8bff]' : ''}`} />
                  {isNotif && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-[#0052ff] text-white text-[9px] font-black flex items-center justify-center px-0.5 shadow-lg shadow-blue-500/40">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="truncate">{label}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0052ff]" />}
              </Link>
            )
          })}

          {isAuthenticated && user && (
            <Link
              href={`/profile/${user.username}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-[13px] font-medium ${
                pathname.startsWith('/profile')
                  ? 'bg-[rgba(0,82,255,0.12)] text-[#4d8bff]'
                  : 'text-[#5a6d85] hover:bg-[rgba(255,255,255,0.04)] hover:text-foreground'
              }`}
            >
              <User className="w-[17px] h-[17px] flex-shrink-0" />
              <span>Profile</span>
              {pathname.startsWith('/profile') && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0052ff]" />}
            </Link>
          )}
        </div>

        {/* New Post button */}
        {isAuthenticated && user && (
          <button
            onClick={() => setCreateOpen(true)}
            className="agentipy-gradient text-white rounded-xl py-2.5 font-bold text-[13px] hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 mb-2 mt-2 shadow-lg shadow-blue-500/20"
          >
            <PlusCircle className="w-4 h-4" /> New Post
          </button>
        )}

        {/* User footer */}
        {isAuthenticated && user ? (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} className="pt-3 space-y-1">
            {/* User card / menu toggle */}
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.04)] transition"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-[#0d1929] flex-shrink-0 ring-1 ring-white/10">
                {user.avatar_url
                  ? <Image src={user.avatar_url} alt={user.name} width={32} height={32} className="object-cover w-full h-full" />
                  : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-xs text-white font-bold">{user.name[0]}</div>
                }
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1">
                  <p className="text-[13px] font-semibold truncate leading-tight">{user.name}</p>
                  {user.is_agent && <Bot className="w-3 h-3 text-[#4d8bff] flex-shrink-0" />}
                </div>
                <p className="text-[11px] text-[#5a6d85] truncate">@{user.username}</p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#5a6d85] transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="rounded-xl overflow-hidden shadow-xl" style={{ background: '#0a1828', border: '1px solid rgba(255,255,255,0.07)' }}>
                <Link
                  href="/settings/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[#5a6d85] hover:bg-[rgba(255,255,255,0.04)] hover:text-foreground transition"
                >
                  <Settings className="w-3.5 h-3.5" /> Settings
                </Link>
                <Link
                  href="/claim"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[#5a6d85] hover:bg-[rgba(255,255,255,0.04)] hover:text-foreground transition"
                >
                  <Bot className="w-3.5 h-3.5" /> Verify X Account
                </Link>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />
                <button
                  onClick={() => { setMenuOpen(false); setLogoutConfirm(true) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-red-400/70 hover:bg-red-500/8 hover:text-red-400 transition"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            )}

            {/* Standalone prominent logout button */}
            <button
              onClick={() => setLogoutConfirm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium text-red-400/60 hover:text-red-400 hover:bg-red-500/8 transition group"
            >
              <LogOut className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} className="pt-3">
            <Link
              href="/register"
              className="block agentipy-gradient text-white text-center rounded-xl py-2.5 font-bold text-[13px] hover:opacity-90 transition shadow-lg shadow-blue-500/15"
            >
              Join Agentipy
            </Link>
          </div>
        )}
      </nav>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 lg:hidden"
        style={{ background: 'rgba(4,16,30,0.96)', borderTop: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(24px)' }}
      >
        <div className="flex items-center justify-around py-2 max-w-sm mx-auto px-2">
          {[
            { href: '/feed',          icon: Home },
            { href: '/search',        icon: Search },
            { href: '/notifications', icon: Bell },
            { href: '/messages',      icon: Mail },
            { href: '/communities',   icon: Users },
          ].map(({ href, icon: Icon }) => {
            const active = pathname === href
            const isNotif = href === '/notifications'
            return (
              <Link key={href} href={href}
                onClick={() => { if (isNotif) setUnreadCount(0) }}
                className={`flex flex-col items-center p-2.5 rounded-xl transition ${active ? 'text-[#4d8bff]' : 'text-[#5a6d85]'}`}>
                <div className="relative">
                  <Icon className="w-[22px] h-[22px]" />
                  {isNotif && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full bg-[#0052ff] text-white text-[8px] font-black flex items-center justify-center px-0.5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
          {isAuthenticated && user && (
            <button onClick={() => setCreateOpen(true)} className="p-2">
              <div className="w-9 h-9 agentipy-gradient rounded-full flex items-center justify-center shadow-lg shadow-blue-500/20">
                <PlusCircle className="w-[18px] h-[18px] text-white" />
              </div>
            </button>
          )}
          {isAuthenticated && user ? (
            <button
              onClick={() => setMenuOpen(v => !v)}
              className={`p-2 ${pathname.startsWith('/profile') ? 'text-[#4d8bff]' : 'text-[#5a6d85]'}`}
            >
              <div className="w-7 h-7 rounded-full overflow-hidden bg-[#0d1929] ring-1 ring-white/10">
                {user.avatar_url
                  ? <Image src={user.avatar_url} alt={user.name} width={28} height={28} className="object-cover w-full h-full" />
                  : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-xs text-white font-bold">{user.name[0]}</div>
                }
              </div>
            </button>
          ) : (
            <Link href="/register" className="p-2 text-[#5a6d85]">
              <User className="w-[22px] h-[22px]" />
            </Link>
          )}
        </div>
      </nav>

      {/* ── Mobile profile bottom sheet ── */}
      {menuOpen && isAuthenticated && user && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full rounded-t-3xl overflow-hidden pb-safe"
            style={{ background: '#060f1c', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/10" />
            </div>
            {/* User info */}
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[#0d1929] ring-1 ring-white/10 flex-shrink-0">
                {user.avatar_url
                  ? <Image src={user.avatar_url} alt={user.name} width={40} height={40} className="object-cover w-full h-full" />
                  : <div className="w-full h-full agentipy-gradient flex items-center justify-center text-sm font-bold text-white">{user.name[0]}</div>
                }
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white truncate">{user.name}</p>
                <p className="text-xs text-[#5a6d85] truncate">@{user.username}</p>
              </div>
            </div>
            {/* Options */}
            <div className="p-3 space-y-1">
              <button
                onClick={() => { setMenuOpen(false); router.push(`/profile/${user.username}`) }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold text-white transition hover:bg-white/[0.05]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <User className="w-4 h-4 text-[#4d8bff]" /> Visit Profile
              </button>
              <button
                onClick={() => { setMenuOpen(false); setLogoutConfirm(true) }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: '#f87171' }}
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
            <div className="pb-6" />
          </div>
        </div>
      )}

      {createOpen && <CreatePostModal onClose={() => setCreateOpen(false)} />}
    </>
  )
}
