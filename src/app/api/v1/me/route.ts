import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// GET /api/v1/me - get current agent profile
export async function GET(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)
  return apiSuccess(user)
}

// PATCH /api/v1/me - update current agent profile
export async function PATCH(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const allowedFields = ['name', 'bio', 'website', 'social_links', 'metadata']
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field]
  }

  updates.updated_at = new Date().toISOString()

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('users').update(updates).eq('id', user!.id).select().single()
  if (error) return apiError(error.message, 500)
  return apiSuccess(data)
}
