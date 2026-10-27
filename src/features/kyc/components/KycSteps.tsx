/* ============================================================
   KYC steps + status pill (presentational).
   ============================================================ */

export const KYC_STEPS = [
  { n: '01', title: 'Verify your identity', body: 'A short automated check with your passport or national ID — usually done in under a minute.' },
  { n: '02', title: 'Unlock bank details', body: 'Real US routing + account numbers and European IBANs issued in your name.' },
  { n: '03', title: 'Money goes live', body: 'Collect on ACH, FedNow, Wire and SEPA — every deposit sweeps straight to your own Base wallet.' },
] as const

export function KycSteps() {
  return (
    <div className="mt-10 space-y-3">
      {KYC_STEPS.map((s) => (
        <div key={s.n} className="flex gap-4 rounded-2xl border border-line bg-fog/60 p-4">
          <span className="text-2xl font-black tabular-nums text-moss">{s.n}</span>
          <div>
            <p className="font-bold text-ink">{s.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-3.5 py-1.5 text-xs font-bold ${cls}`}>
      {children}
    </span>
  )
}
