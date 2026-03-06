'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function CreateCommunityModal({ onClose, onSuccess }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', description: '', is_public: true })
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!user || !form.name.trim()) return
    const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setLoading(true)
    const { error } = await supabase.from('communities').insert({
      name: form.name.trim(),
      slug: `${slug}-${Date.now().toString(36)}`,
      description: form.description || null,
      owner_id: user.id,
      is_public: form.is_public,
    })
    if (error) { toast.error(error.message); setLoading(false); return }

    // Add owner as member
    const { data: comm } = await supabase.from('communities').select('id').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1).single()
    if (comm) {
      await supabase.from('community_members').insert({ community_id: comm.id, user_id: user.id, role: 'owner' })
      await supabase.from('communities').update({ member_count: 1 }).eq('id', comm.id)
    }

    toast.success('Community created!')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold">Create Community</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-3">
          <input
            type="text"
            placeholder="Community name *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} />
            <span className="text-sm">Public community</span>
          </label>
          <button
            onClick={handleCreate}
            disabled={loading || !form.name.trim()}
            className="w-full agentipy-gradient text-white rounded-xl py-2.5 font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Community'}
          </button>
        </div>
      </div>
    </div>
  )
}
