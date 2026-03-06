'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@/lib/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  walletAddress: string | null
  isAuthenticated: boolean
  setWalletAddress: (addr: string | null) => void
  loginWithApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  walletAddress: null,
  isAuthenticated: false,
  setWalletAddress: () => {},
  loginWithApiKey: async () => ({ success: false }),
  signOut: () => {},
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [walletAddress, setWalletAddressState] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const fetchUserByWallet = useCallback(async (wallet: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .single()
    return data as User | null
  }, [])

  const fetchUserByApiKey = useCallback(async (apiKey: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('api_key', apiKey)
      .single()
    return data as User | null
  }, [])

  const refreshUser = useCallback(async () => {
    const storedWallet = localStorage.getItem('agentipy_wallet')
    if (storedWallet) {
      const u = await fetchUserByWallet(storedWallet)
      if (u) setUser(u)
    }
  }, [fetchUserByWallet])

  // Restore + re-validate session from localStorage on mount
  useEffect(() => {
    const storedWallet = localStorage.getItem('agentipy_wallet')
    const storedApiKey = localStorage.getItem('agentipy_apikey')

    if (storedWallet && storedApiKey) {
      setWalletAddressState(storedWallet)
      fetchUserByApiKey(storedApiKey).then(u => {
        if (u && u.wallet_address === storedWallet.toLowerCase()) {
          setUser(u)
          setIsAuthenticated(true)
        } else {
          // Stale / invalid — clear
          localStorage.removeItem('agentipy_wallet')
          localStorage.removeItem('agentipy_apikey')
          setWalletAddressState(null)
          setUser(null)
          setIsAuthenticated(false)
        }
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  }, [fetchUserByApiKey])

  const setWalletAddress = useCallback((addr: string | null) => {
    setWalletAddressState(addr)
    if (addr) {
      localStorage.setItem('agentipy_wallet', addr)
    } else {
      localStorage.removeItem('agentipy_wallet')
      localStorage.removeItem('agentipy_apikey')
      setUser(null)
      setIsAuthenticated(false)
    }
  }, [])

  const loginWithApiKey = useCallback(async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
    const wallet = localStorage.getItem('agentipy_wallet')
    if (!wallet) return { success: false, error: 'No wallet connected' }

    const u = await fetchUserByApiKey(apiKey)
    if (!u) return { success: false, error: 'Invalid API key' }
    if (u.wallet_address !== wallet.toLowerCase()) {
      return { success: false, error: 'API key does not match this wallet' }
    }

    localStorage.setItem('agentipy_apikey', apiKey)
    setWalletAddressState(wallet)
    setUser(u)
    setIsAuthenticated(true)
    return { success: true }
  }, [fetchUserByApiKey])

  const signOut = useCallback(() => {
    localStorage.removeItem('agentipy_wallet')
    localStorage.removeItem('agentipy_apikey')
    setWalletAddressState(null)
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading, walletAddress, isAuthenticated,
      setWalletAddress, loginWithApiKey, signOut, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
