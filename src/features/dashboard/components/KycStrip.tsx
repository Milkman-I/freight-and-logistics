/* ============================================================
   KYC status strip — real status straight off user_profiles.
   ============================================================ */

import type { KycStatus } from '../../../types/user'

const styles = {
  approved: { pill: 'bg-[#D6F5C0] text-[#2E5B12]', text: 'Verified — your accounts are active and unlocked.', action: null },
  under_review: { pill: 'bg-[#FFE9B8] text-[#8A5A00]', text: 'KYC in review. Money features unlock as soon as checks clear.', action: { label: 'Check status' } },
  incomplete: { pill: 'bg-[#FFE9B8] text-[#8A5A00]', text: 'Your verification isn’t finished yet.', action: { label: 'Finish verification' } },
  rejected: { pill: 'bg-[#FDD9D7] text-[#9B1C12]', text: 'Verification failed. Contact support to retry.', action: null },
  not_started: { pill: 'bg-lime text-on-lime', text: 'One quick check and your bank details go live.', action: { label: 'Verify identity →' } },
} as const

export function KycStrip({
  kyc,
  accountsReady = true,
  onOpenKyc,
}: {
  kyc: KycStatus
  accountsReady?: boolean
  onOpenKyc: () => void
}) {
  const s = styles[kyc]
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-fog px-4 py-3">
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${s.pill}`}>
        {kyc === 'approved' ? 'Verified' : kyc === 'under_review' ? 'KYC pending review' : kyc === 'rejected' ? 'Verification failed' : kyc.replace('_', ' ')}
      </span>
      <p className="flex-1 text-sm text-muted">
        {kyc === 'approved' && !accountsReady
          ? 'Verified — choose where your deposits land to open your bank details.'
          : s.text}
      </p>
      {(s.action || (kyc === 'approved' && !accountsReady)) && (
        <button
          onClick={onOpenKyc}
          className="rounded-full bg-lime px-4 py-2 text-xs font-bold text-on-lime transition-opacity hover:opacity-90"
        >
          {kyc === 'approved' && !accountsReady ? 'Set up accounts' : s.action?.label}
        </button>
      )}
    </div>
  )
}
