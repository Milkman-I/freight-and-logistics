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
  email: string
  full_name: string
  avatar_url: string | null
  bridge_customer_id: string | null
  bridge_kyc_link_id: string | null
  kyc_status: KycStatus
  deposit_destination: string | null
  created_at: string
  updated_at?: string
}
