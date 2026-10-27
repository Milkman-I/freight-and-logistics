/* ============================================================
   F&L types — users (src/types/user.ts)
   Mirrors public.user_profiles on Supabase.
   ============================================================ */

export type KycStatus =
  | 'not_started'
  | 'under_review'
  | 'incomplete'
  | 'approved'
  | 'rejected'

export type UserProfile = {
  id: string
  google_email: string
  full_name: string
  avatar_url: string | null
  bridge_customer_id: string | null
  kyc_status: KycStatus
  created_at: string
  updated_at?: string
}
