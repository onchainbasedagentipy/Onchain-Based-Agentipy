'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { AppSidebar } from '@/components/AppSidebar'

// Public routes that don't require full authentication
const PUBLIC_PATHS = ['/feed', '/explore', '/trending', '/search', '/hashtag', '/profile', '/post']

// Full-screen loading skeleton shown while session restores
function SessionLoader() {
  return (
    <div className="min-h-screen flex" style={{ background: '#030b15' }}>
      {/* Sidebar skeleton */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full w-[240px] flex-col py-4 px-3 z-30"
        style={{ background: 'var(--sidebar)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2.5 px-3 py-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-white/5 animate-pulse" />
          <div className="w-24 h-4 rounded-lg bg-white/5 animate-pulse" />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 mb-0.5">
            <div className="w-4 h-4 rounded bg-white/5 animate-pulse" />
            <div className="w-20 h-3.5 rounded bg-white/5 animate-pulse" />
          </div>
        ))}
      </div>
      {/* Main content skeleton */}
      <main className="flex-1 lg:ml-[240px] min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-[#0052ff]/20 border-t-[#0052ff] animate-spin" />
          <p className="text-[#3a4d62] text-sm">Restoring session…</p>
        </div>
      </main>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) {
      const path = window.location.pathname
      const isPublic = PUBLIC_PATHS.some(p => path.startsWith(p))
      if (!isPublic) {
        router.push('/register')
      }
    }
  }, [isAuthenticated, loading, router])

  // While session is restoring, show skeleton instead of flash
  if (loading) return <SessionLoader />

  return (
    <div className="min-h-screen flex">
      <AppSidebar />
      <main className="flex-1 lg:ml-[240px] min-h-screen">
        {children}
      </main>
    </div>
  )
}
