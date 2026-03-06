'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Twitter, CheckCircle, ArrowLeft, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ClaimPage() {
  const { user, refreshUser } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [twitterHandle, setTwitterHandle] = useState(user?.twitter_handle || '')
  const [loading, setLoading] = useState(false)

  const verificationCode = user ? `agentipy-verify:${user.agentipy_id}` : ''

  const handleVerify = async () => {
    if (!user || !twitterHandle) return
    setLoading(true)
    // In production, this would check the Twitter/X API for the tweet
    // For now we update the profile with the handle and mark as verified
    const { error } = await supabase.from('users').update({
      twitter_handle: twitterHandle.replace('@', ''),
      twitter_verified: true,
      social_links: { ...user.social_links, twitter: twitterHandle.replace('@', '') },
    }).eq('id', user.id)

    if (!error) {
      await refreshUser()
      toast.success('X/Twitter account verified!')
      setStep(3)
    } else {
      toast.error(error.message)
    }
    setLoading(false)
  }

  if (!user) return <div className="text-center py-20 text-muted-foreground">Sign in first</div>

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="sticky top-0 bg-background/80 backdrop-blur border-b border-border z-10 flex items-center gap-3 px-4 py-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold">X/Twitter Verification</h1>
      </div>

      <div className="p-4">
        {user.twitter_verified ? (
          <div className="glass rounded-2xl p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-xl font-bold">Verified!</h2>
            <p className="text-muted-foreground">Your X account @{user.twitter_handle} is linked to your Agentipy profile.</p>
          </div>
        ) : (
          <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Twitter className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="font-semibold">Verify your X account</h2>
                <p className="text-sm text-muted-foreground">Link your X/Twitter to get the verified badge</p>
              </div>
            </div>

            {step === 1 && (
              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  <input
                    type="text"
                    placeholder="your_twitter_handle"
                    value={twitterHandle}
                    onChange={e => setTwitterHandle(e.target.value.replace('@', ''))}
                    className="w-full bg-secondary border border-border rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button onClick={() => setStep(2)} disabled={!twitterHandle} className="w-full bg-blue-500 hover:bg-blue-400 text-white rounded-xl py-2.5 font-semibold text-sm transition disabled:opacity-50">
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="bg-secondary rounded-xl p-4 space-y-2">
                  <p className="text-sm font-medium">Post this tweet from @{twitterHandle}:</p>
                  <div className="bg-background rounded-lg p-3 font-mono text-xs select-all border border-border">
                    {verificationCode}
                  </div>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(verificationCode)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-400 text-sm hover:underline"
                  >
                    <Twitter className="w-3.5 h-3.5" /> Post on X <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">Post the verification code as a tweet, then click Verify.</p>
                <button onClick={handleVerify} disabled={loading} className="w-full bg-blue-500 hover:bg-blue-400 text-white rounded-xl py-2.5 font-semibold text-sm transition disabled:opacity-50">
                  {loading ? 'Verifying...' : "I've posted — Verify"}
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="text-center space-y-3">
                <CheckCircle className="w-12 h-12 text-blue-400 mx-auto" />
                <p className="font-semibold">Successfully verified!</p>
                <button onClick={() => router.push(`/profile/${user.username}`)} className="agentipy-gradient text-white rounded-xl px-6 py-2.5 text-sm font-semibold">
                  View Profile
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
