# F&L Design System — "Lime Voltage"

> Version 1.0 · Light-first with dark mode · Vite + React + Tailwind implementation
> Reference influences: Wise (Wise Sans · green money psychology), Mercury (restraint)

---

## 1. Brand Foundations

| Property | Value |
|---|---|
| Brand name | **F&L** |
| Wordmark style | Bold geometric sans, "&" set in Lime Voltage for accent |
| Design personality | Trustworthy, fresh, fast-moving, banking-grade |
| Voice | Clear, friendly, direct — "Your money, moving" |

F&L is a digital banking / stablecoin platform: users sign in with Google, complete KYC,
receive real bank account details (routing/account, IBAN…), collect money, and send money
via custodial wallets.

**Psychological rule:** green = money arriving. Every positive money event (deposit
confirmed, transfer received, balance tick) uses the brand lime. Never use lime for
errors or warnings.

---

## 2. Color Palette

### 2.1 Brand core (light theme)

| Token | Hex | Usage |
|---|---|---|
| `--brand-ink` | `#163300` | Primary text, headings, dark surfaces |
| `--brand-lime` | `#9FE870` | Primary CTA, brand highlights, positive money |
| `--brand-moss` | `#5B8A1E` | Links, hover/active, icon accents |
| `--brand-spring` | `#E9F5DF` | Tinted backgrounds, selection, chips |

### 2.2 Neutrals (light theme)

| Token | Hex | Usage |
|---|---|---|
| `--bg-paper` | `#FDFDFC` | Page background |
| `--bg-fog` | `#F3F5F0` | Cards, inputs, panels |
| `--border-line` | `#E6EAE4` | Borders, dividers, hairlines |
| `--text-secondary` | `#45553B` | Supporting text, captions |

### 2.3 Semantic colors (shared both themes)

| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#3D8A15` | Deposits confirmed, transfers delivered |
| `--color-warning` | `#F5A623` | KYC pending, docs incomplete |
| `--color-danger` | `#E5484D` | Errors, failed transfers, destructive actions |
| `--color-info` | `#0052FF` | System notices, help tips |

### 2.4 Dark theme

| Token | Hex | Usage |
|---|---|---|
| `--brand-ink` | `#E9F5DF` | Text on dark |
| `--brand-lime` | `#9FE870` | Unchanged (vivid on dark) |
| `--bg-paper` | `#12260A` | Page background |
| `--bg-fog` | `#1A2E0E` | Cards, panels |
| `--border-line` | `#33461F` | Borders |
| `--text-secondary` | `#A9BCA0` | Supporting text |

Dark surfaces are **deep forest**, never true black — keeps lime vivid and ties to brand.

### 2.5 Data-viz ramp (for charts)

`#9FE870 → #5B8A1E → #163300` main; tints `#E9F5DF` and grays `#F3F5F0/#45553B` for axes.

### 2.6 Accessibility

- Body text on `--bg-paper`: always `--brand-ink` or `--text-secondary` — AA+.
- Lime `#9FE870` buttons: text must be `#163300` (never white).
- Danger `#E5484D`: white text OK. Warning `#F5A623`: text `#3B2A00`.

---

## 3. Typography

| Token | Value |
|---|---|
| Font family | **Inter** (UI) — fallback system-ui |
| Display | Inter 700–800, tight tracking (-0.02em) |
| Hero | 48–64px / 1.05 line-height |
| H1 | 32–40px |
| H2 | 24–28px |
| H3 | 18–20px |
| Body | 15–16px / 1.6 |
| Small / caption | 12–13px |
| Money & numbers | Inter with `font-variant-numeric: tabular-nums`; **always** show `+`/`-` and currency |
| Tabular listing row | 14px |

Optional future: "Grandstander"-style display font for hero — keep Inter until brand matures.

---

## 4. Spacing & Layout

| Token | Value |
|---|---|
| Base unit | 4px |
| Scale | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 |
| Page padding | 32px desktop / 16px mobile |
| Card padding | 24px |
| Content max-width | 1140px desktop |
| Radius | inputs/buttons 10px · cards 16px · pills 999px |
| Shadow | `0 1px 3px rgba(22,51,0,.06)` light; none/darker on dark |

---

## 5. Components (F&L specifics)

### 5.1 Buttons

- **Primary**: lime bg, forest text, 10px radius, semibold.
- **Secondary (ghost)**: transparent, 1.5px `#C4CCB4` border, ink text.
- **Danger**: `#E5484D` bg, white text — destructive only.
- **States**: hover = moss-tint bg; disabled = Fog bg + 50% opacity.
- Min-height 44px (touch targets).

### 5.2 Money cards (balance card)

- White (light) / `#1A2E0E` (dark), radius 16px, 24px padding.
- `label` = 11px uppercase, tracked, 60% opacity.
- Balance = 30px, 800 weight, tabular nums.
- Status pill row under balance: network (USDB · Base), rewards (+APY).

### 5.3 Status pills

| State | Light bg / text | Meaning |
|---|---|---|
| Pending | `#FFE9B8` / `#8A5A00` | KYC in review, processing |
| Confirmed | `#D6F5C0` / `#2E5B12` | Money arrived |
| Failed | `#FDD9D7` / `#9B1C12` | Transfer failed |
| Neutral | `#E7EDE2` / `#45553B` | informational |

### 5.4 Forms & inputs

- 24px label → 4px gap; input height 48px; radius 10px.
- Inputs: Fog bg, no border, border on focus = Moss + 3px Spring glow.
- Errors: 12px `#9B1C12` text below input; shake animation ≤ 300ms.

### 5.5 KYC flow states (specific to F&L)

1. `not_started` — CTA "Verify identity →"
2. `under_review` — amber pill "KYC pending review" (no locking docs)
3. `approved` — green pill "Verified" + unlock accounts
4. `rejected` — danger banner + list `rejection_reasons`

### 5.6 Webhook-driven money states (specific to F&L)

Deposit lifecycle for UI copy: `awaiting_funds → funds_arriving → pending →
funds_received` (green) and `failed` (red, with recovery.ACTION button).

---

## 6. Iconography

- Stroke icons, 1.75px stroke, round caps — heroicons/lucide.
- 20px in lines, 24px standalone, 4px optical box.
- Money movement icons: arrow-in = lime, arrow-out = ink, warning = amber.

---

## 7. Motion

| Interaction | Spec |
|---|---|
| Button hover | 150ms ease-out bg shift |
| Card hover | 200ms translateY(-2px) |
| Deposit/transfer arrives | 400ms count-up + soft lime flash |
| Page transitions | ≤ 250ms, fade+8px slide |
| Balance updating | pulse the pill, then flash |

**Rules:** never animate balance totals > 500ms; money-moving moments ≤ 400ms;
page loads get skeletons, not spinners.

---

## 8. Dark/Light behavior

- Default = light theme. Manual toggle in settings; persisted to `localStorage`.
- Dark mode swaps token values only (section 2.4) — no separate markup.
- Never render lime bg on lime text; in dark mode use Spring text with Lime bg.

---

## 9. Copy guide (money platform)

- `Send money` — not `Withdraw` (positive framing).
- `Add money` — not `Deposit funds` (lighter framing).
- Confirmations: "Money is on its way" → "Money arrived ✅".
- Errors: state what happened + what to do ("Transfer failed. Funds were
  returned to your wallet — tap to retry").
- KYC copy: precise ("Government ID mismatch — use the same ID you gave earlier").

---

## 10. Implementation notes

- **Tailwind config** mirrors tokens in section 2; tokens as CSS variables in
  `:root` + `[data-theme="dark"]` override blocks (see `tokens.css`).
- `tokens.css` is source of truth: changes there propagate to docs and UI.
- Every new component must have light + dark verified before merge.
- Webhook/SSR-derived status strings render through `<MoneyStateBadge />` only.
