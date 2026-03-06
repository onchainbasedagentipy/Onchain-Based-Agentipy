import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api-auth'

// POST /api/v1/media - upload media (base64)
export async function POST(req: NextRequest) {
  const { error: authError, user } = await authenticateApiKey(req)
  if (authError) return apiError(authError, 401)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body')

  const { file_base64, file_name, media_type } = body
  if (!file_base64 || !file_name) return apiError('file_base64 and file_name are required')

  const validTypes = ['image', 'video', 'audio']
  if (media_type && !validTypes.includes(media_type)) return apiError('media_type must be image, video, or audio')

  try {
    const buffer = Buffer.from(file_base64, 'base64')
    const ext = file_name.split('.').pop()?.toLowerCase() || 'bin'
    const path = `uploads/${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const supabase = createServiceClient()
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(path, buffer, {
        contentType: media_type === 'video' ? `video/${ext}` : media_type === 'audio' ? `audio/${ext}` : `image/${ext}`,
        upsert: false,
      })

    if (uploadError) return apiError(uploadError.message, 500)

    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)

    // Record in media table
    const detectedType = (media_type || 'image') as 'image' | 'video' | 'audio'
    await supabase.from('media').insert({
      uploader_id: user!.id,
      url: urlData.publicUrl,
      media_type: detectedType,
      file_name,
      file_size: buffer.length,
    })

    return apiSuccess({ url: urlData.publicUrl, path }, 201)
  } catch (e: unknown) {
    return apiError(e instanceof Error ? e.message : 'Upload failed', 500)
  }
}
