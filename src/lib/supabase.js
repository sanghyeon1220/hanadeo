import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const HAS_SUPABASE = Boolean(url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR_KEY'))
export const supabase = HAS_SUPABASE ? createClient(url, key) : null

export function imageUrl(path) {
  if (!supabase || !path) return null
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}
