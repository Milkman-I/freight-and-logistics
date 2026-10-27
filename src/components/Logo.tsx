/* ============================================================
   F&L components — Logo
   'light' variant = for dark backgrounds; 'dark' = for light pages.
   ============================================================ */

type Props = { size?: 'md' | 'lg'; variant?: 'light' | 'dark' }

export function Logo({ size = 'md', variant = 'dark' }: Props) {
  const textSize = size === 'lg' ? 'text-3xl' : 'text-2xl'

  const main = variant === 'light' ? 'text-[#E9F5DF]' : 'text-ink'
  return (
    <span className={`inline-flex items-baseline gap-px font-extrabold tracking-tight ${textSize}`}>
      <span className={main}>F</span>
      <span className="text-lime">&amp;</span>
      <span className={main}>L</span>
      <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-lime" aria-hidden />
    </span>
  )
}
