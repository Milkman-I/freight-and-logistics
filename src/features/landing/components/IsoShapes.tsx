/* ============================================================
   Isometric brand shapes — landing feature cards.
   Hand-built isometric SVGs colored strictly in Lime Voltage;
   geometry helpers below keep every face consistent.
   ============================================================ */

const STROKE = '#C4CCB4'

function ptsList(list: [number, number][]) {
  return list.map(([x, y]) => `${x},${y}`).join(' ')
}

function cubeFaces(cx: number, cy: number, rx: number, ry: number, h: number) {
  return {
    top: ptsList([
      [cx, cy - ry],
      [cx + rx, cy],
      [cx, cy + ry],
      [cx - rx, cy],
    ]),
    right: ptsList([
      [cx + rx, cy],
      [cx, cy + ry],
      [cx, cy + ry + h],
      [cx + rx, cy + h],
    ]),
    left: ptsList([
      [cx - rx, cy],
      [cx, cy + ry],
      [cx, cy + ry + h],
      [cx - rx, cy + h],
    ]),
  }
}

function isoDots(cx: number, cy: number, step: number, n: number) {
  const dots: [number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      dots.push([cx + (i - j) * step * 0.866, cy + (i + j - (n - 1)) * step * 0.5])
    }
  }
  return dots
}

type CubeProps = {
  cx: number
  cy: number
  rx: number
  ry: number
  h: number
  top?: string
  left?: string
  right?: string
  dots?: { step: number; n: number; color: string }
  accent?: string
}

function Cube({
  cx,
  cy,
  rx,
  ry,
  h,
  top = '#E9F5DF',
  left = '#F3F5F0',
  right = '#E6EAE4',
  dots,
  accent,
}: CubeProps) {
  const f = cubeFaces(cx, cy, rx, ry, h)
  return (
    <g>
      <polygon points={f.left} fill={left} stroke={STROKE} strokeWidth={1} />
      <polygon points={f.right} fill={right} stroke={STROKE} strokeWidth={1} />
      <polygon points={f.top} fill={top} stroke={STROKE} strokeWidth={1} />
      {dots &&
        isoDots(cx, cy, dots.step, dots.n).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.6} fill={dots.color} />
        ))}
      {accent && <circle cx={cx} cy={cy} r={2.6} fill={accent} />}
    </g>
  )
}

function ShapeStack() {
  const plates = [158, 132, 106, 80]
  return (
    <svg viewBox="0 0 240 200" className="h-44 w-full" aria-hidden>
      <ellipse cx={120} cy={176} rx={72} ry={10} fill="#163300" opacity={0.08} />
      <ellipse cx={120} cy={177} rx={44} ry={6} fill="#163300" opacity={0.08} />
      {plates.slice(1).map((cy, i) => (
        <Cube
          key={i}
          cx={120}
          cy={cy}
          rx={78}
          ry={44}
          h={7}
          dots={i === plates.length - 2 ? { step: 13, n: 3, color: '#9FE870' } : undefined}
        />
      ))}
      <Cube cx={120} cy={80} rx={78} ry={44} h={7} dots={{ step: 13, n: 5, color: '#5B8A1E' }} />
      <ellipse
        cx={120}
        cy={80}
        rx={46}
        ry={24}
        fill="none"
        stroke="#9FE870"
        strokeWidth={1.4}
        strokeDasharray="5 5"
      />
    </svg>
  )
}

function ShapeLinked() {
  return (
    <svg viewBox="0 0 240 200" className="h-44 w-full" aria-hidden>
      <line x1={62} y1={88} x2={62} y2={172} stroke={STROKE} strokeWidth={1} strokeDasharray="3 4" />
      <line x1={168} y1={122} x2={168} y2={172} stroke={STROKE} strokeWidth={1} strokeDasharray="3 4" />
      <line x1={98} y1={162} x2={98} y2={172} stroke={STROKE} strokeWidth={1} strokeDasharray="3 4" />
      <line x1={40} y1={172} x2={190} y2={172} stroke={STROKE} strokeWidth={1} />

      <path
        d="M 62 88 L 62 112 L 120 112 L 120 128 L 168 128 L 168 140 L 98 140 L 98 150"
        fill="none"
        stroke="#5B8A1E"
        strokeWidth={2}
      />
      <circle cx={62} cy={88} r={3.2} fill="#9FE870" stroke="#5B8A1E" strokeWidth={1.4} />
      <circle cx={98} cy={150} r={2.6} fill="#9FE870" />

      <Cube cx={62} cy={64} rx={30} ry={17} h={24} />
      <Cube cx={168} cy={110} rx={20} ry={12} h={16} dots={{ step: 7, n: 3, color: '#5B8A1E' }} />
      <Cube
        cx={98}
        cy={164}
        rx={16}
        ry={9}
        h={10}
        top="#9FE870"
        left="#7CB44E"
        right="#8FCF5F"
        accent="#163300"
      />
    </svg>
  )
}

function ShapeMatrix() {
  const smalls: { x: number; y: number; lime?: boolean }[] = []
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      smalls.push({
        x: 120 + (i - j) * 26,
        y: 34 + (i + j) * 14,
        lime: i === 1 && j === 1,
      })
    }
  }
  return (
    <svg viewBox="0 0 240 200" className="h-44 w-full" aria-hidden>
      <ellipse cx={120} cy={172} rx={68} ry={9} fill="#163300" opacity={0.08} />
      {smalls.map((s, i) =>
        s.lime ? (
          <Cube
            key={i}
            cx={s.x}
            cy={s.y}
            rx={13}
            ry={7.5}
            h={9}
            top="#9FE870"
            left="#7CB44E"
            right="#8FCF5F"
          />
        ) : (
          <Cube key={i} cx={s.x} cy={s.y} rx={13} ry={7.5} h={9} />
        ),
      )}
      <Cube
        cx={120}
        cy={130}
        rx={62}
        ry={36}
        h={30}
        top="#FDFDFC"
        dots={{ step: 11, n: 4, color: '#C4CCB4' }}
        accent="#9FE870"
      />
      <line
        x1={120}
        y1={64}
        x2={120}
        y2={92}
        stroke="#9FE870"
        strokeWidth={1.6}
        strokeDasharray="3 4"
      />
      <circle cx={120} cy={92} r={2.6} fill="#9FE870" />
    </svg>
  )
}

function ShapeOrbit() {
  return (
    <svg viewBox="0 0 240 200" className="h-44 w-full" aria-hidden>
      <line x1={120} y1={86} x2={120} y2={124} stroke={STROKE} strokeWidth={1} strokeDasharray="3 4" />
      <ellipse
        cx={120}
        cy={144}
        rx={98}
        ry={30}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.2}
        strokeDasharray="4 5"
      />
      <path d="M 30 152 A 98 30 0 0 0 52 162" fill="none" stroke="#5B8A1E" strokeWidth={1.6} />
      <polygon points="52,162 46,158 47,165" fill="#5B8A1E" />
      <path d="M 210 136 A 98 30 0 0 0 188 126" fill="none" stroke="#5B8A1E" strokeWidth={1.6} />
      <polygon points="188,126 194,130 193,123" fill="#5B8A1E" />
      <circle cx={22} cy={144} r={3} fill="#5B8A1E" />
      <circle cx={218} cy={144} r={3} fill="#5B8A1E" />

      <Cube cx={120} cy={124} rx={78} ry={44} h={14} top="#FDFDFC" dots={{ step: 14, n: 4, color: '#C4CCB4' }} />
      <Cube cx={120} cy={68} rx={22} ry={13} h={14} dots={{ step: 7, n: 3, color: '#5B8A1E' }} />
      <circle cx={120} cy={68} r={2.6} fill="#9FE870" />
    </svg>
  )
}

export const SHAPES = [ShapeStack, ShapeLinked, ShapeMatrix, ShapeOrbit] as const
