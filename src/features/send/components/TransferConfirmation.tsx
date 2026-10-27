/*
  TransferConfirmation — "Money is on its way" panel shown right
  after a transfer row is created (status pending).
*/

export function TransferConfirmation({
  sent,
  recipient,
  rail,
  onAgain,
  onDone,
}: {
  sent: { id: string; amount: string }
  recipient: string
  rail: string
  onAgain: () => void
  onDone: () => void
}) {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-lime/20 text-3xl">
        ✈️
      </span>
      <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-ink">
        Money is on its way
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        {sent.amount} to <b className="text-ink">{recipient || 'recipient'}</b> · rail{' '}
        <span className="uppercase">{rail}</span>
      </p>
      <p className="mt-2 text-sm text-muted">
        Transfer ID <span className="font-mono">{sent.id.slice(0, 8)}</span> — track it live in
        your transactions history. Transfers settle in about 3.2 seconds.
      </p>
      <span className="mt-5 inline-block rounded-full bg-[#D6F5C0] px-4 py-1.5 text-xs font-bold text-[#2E5B12]">
        Pending · webhook will confirm
      </span>
      <div className="mt-8 flex justify-center gap-3">
        <button
          onClick={onAgain}
          className="h-12 rounded-xl border-[1.5px] border-[#C4CCB4] px-6 text-base font-semibold text-ink transition-colors hover:bg-fog"
        >
          Send again
        </button>
        <button
          onClick={onDone}
          className="h-12 rounded-xl bg-lime px-6 text-base font-bold text-on-lime transition-transform hover:-translate-y-0.5"
        >
          Go to dashboard
        </button>
      </div>
    </div>
  )
}
