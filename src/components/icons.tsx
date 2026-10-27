/* ============================================================
   F&L components — icons (src/components/icons.tsx)
   Shared stroke-icon primitives (1.75px stroke, round caps — DS §6).
   ============================================================ */

export function I({
  d,
  className = 'h-5 w-5',
}: {
  d: string | readonly string[]
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  )
}

export const ICONS = {
  home: 'M4 11 12 4l8 7M6 10v10h12V10',
  bank: ['M3 10h18M12 3l9 7H3l9-7Z', 'M5 10v8M10 10v8M14 10v8M19 10v8', 'M4 18h16'],
  inArrow: 'M17 8 7 17M15 17H7V9',
  outArrow: 'M7 17 17 7M9 7h8v8',
  chart: ['M3 16l5-6 4 3 6-8', 'M2 20h20'],
  list: ['M4 5h16v14H4zM4 9h16'],
  doc: ['M6 3h9l4 4v14H6zM15 3v4h4', 'M9 12h6M9 16h6'],
  invoice: ['M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z', 'M9 8h6M9 12h6M9 16h3'],
  userCheck: [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M4 20c0-3 2.2-5.5 5-5.5 1 0 1.9.3 2.7.8',
    'M17 14v6M14 17h6',
  ],
  shieldCheck: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z', 'M9 12l2 2 4-4'] as string[],
  signOut: ['M15 4h4v16h-4', 'M11 16l-4-4 4-4M7 12h10'],
} as const
