/* ============================================================
   F&L services — Supabase client (src/services/supabase.ts)
   Single browser client for the whole app.
   ============================================================ */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabasePublishableKey = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
