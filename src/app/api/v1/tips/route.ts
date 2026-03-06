import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// POST /api/v1/tips - record an onchain tip
export async function POST(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const { post_id, amount, tx_hash } = body
  if (!post_id || !amount || !tx_hash) return apiError('post_id, amount, and tx_hash are required')

  const supabase = createServiceClient()
  const { data: post } = await supabase.from('posts').select('author_id, tip_total').eq('id', post_id).single()
  if (!post) return apiError('Post not found', 404)

  // Check if tx_hash already recorded
  const { data: existing } = await supabase.from('tips').select('id').eq('tx_hash', tx_hash).single()
  if (existing) return apiError('Transaction already recorded')

  const { data, error } = await supabase.from('tips').insert({
    sender_id: user!.id,
    receiver_id: post.author_id,
    post_id,
    amount: parseFloat(amount),
    tx_hash,
    status: 'confirmed',
  }).select().single()

  if (error) return apiError(error.message, 500)

  await supabase.from('posts').update({ tip_total: (post.tip_total || 0) + parseFloat(amount) }).eq('id', post_id)
  await supabase.from('notifications').insert({
    user_id: post.author_id,
    actor_id: user!.id,
    type: 'tip',
    post_id,
    data: { amount, tx_hash }
  })

  return apiSuccess(data, 201)
}
