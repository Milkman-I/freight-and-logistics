/* ============================================================
   F&L components — CurvedArrow (lime arrow accent, DS §6)
   Small curved arrow used on buttons/links.
   ============================================================ */

type Props = { size?: number; className?: string }

export function CurvedArrow({ size = 16, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 17c4.5.5 9-2 9-8.5" />
      <path d="M9.5 6.5 13 8.5 11 12" />
    </svg>
  )
}
