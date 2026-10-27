/* ============================================================
   F&L services — profiles (src/services/profiles.ts)
   user_profiles reads (RLS: select-own).
   ============================================================ */

import { supabase } from './supabase'
import type { UserProfile } from '../types/user'

export async function fetchProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .schema('public')
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw new Error(error.message)
  return data as UserProfile
}
