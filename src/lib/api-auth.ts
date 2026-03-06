import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function authenticateApiKey(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
  if (!apiKey) return { error: 'Missing API key', user: null }
  
  const supabase = createServiceClient()
  const { data: user } = await supabase.from('users').select('*').eq('api_key', apiKey).single()
  if (!user) return { error: 'Invalid API key', user: null }
  
  return { error: null, user }
}

export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}
