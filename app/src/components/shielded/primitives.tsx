// Shared visual primitives for the shielded surfaces (employer + employee).
//
// Everything else in this folder should compose these instead of re-rolling
// inline styles. The goal is one place to change spacing, button hierarchy,
// status colours, and typography for the whole shielded layer.

import type { CSSProperties, ReactNode } from 'react'

/** 4-step spacing scale. Use these everywhere instead of arbitrary px. */
export const sp = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const

/** Status colour vocabulary. Match across pill, payroll rows, inbox rows. */
export const tone = {
  muted: { bg: 'rgba(160,160,180,0.10)', fg: 'var(--text-muted)' },
  accent: { bg: 'var(--accent-subtle)', fg: 'var(--accent)' },
  ok: { bg: 'rgba(46,213,115,0.12)', fg: '#2ed573' },
  warn: { bg: 'rgba(255,165,2,0.14)', fg: '#ffa502' },
  err: { bg: 'rgba(255,71,87,0.14)', fg: '#ff4757' },
} as const

export type Tone = keyof typeof tone

// -------- Eyebrow label ----------
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div style={{
      fontSize: 11,
      color: color ?? 'var(--text-muted)',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontWeight: 600,
      marginBottom: sp.xs,
    }}>{children}</div>
  )
}

// -------- Stat tile (balance / metric) ----------
interface StatTileProps {
  label: ReactNode
  value: ReactNode
  subtitle?: ReactNode
  tone?: 'neutral' | 'accent'
}
export function StatTile({ label, value, subtitle, tone: t = 'neutral' }: StatTileProps) {
  const isAccent = t === 'accent'
  return (
    <div style={{
      padding: sp.lg,
      borderRadius: 'var(--radius)',
      background: isAccent ? 'var(--accent-subtle)' : 'var(--bg-base)',
      border: '1px solid var(--border)',
    }}>
      <Eyebrow color={isAccent ? 'var(--accent)' : undefined}>{label}</Eyebrow>
      <div
        className="mono"
        style={{ fontSize: 22, fontWeight: 600, color: isAccent ? 'var(--accent)' : 'var(--text-primary)', lineHeight: 1.1 }}
      >
        {value}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 11,
          color: isAccent ? 'var(--accent)' : 'var(--text-muted)',
          opacity: isAccent ? 0.75 : 1,
          marginTop: sp.xs,
        }}>{subtitle}</div>
      )}
    </div>
  )
}

// -------- Status label (inline pill text) ----------
export function StatusLabel({ tone: t, children }: { tone: Tone; children: ReactNode }) {
  const { fg } = tone[t]
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: fg, letterSpacing: '0.02em' }}>
      {children}
    </span>
  )
}

// -------- Buttons ----------
type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md'

interface BtnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  onClick?: () => void
  title?: string
  children: ReactNode
  style?: CSSProperties
}

export function Btn({ variant = 'primary', size = 'md', disabled, onClick, title, children, style }: BtnProps) {
  const base: CSSProperties = {
    border: 'none',
    borderRadius: 'var(--radius)',
    fontWeight: 600,
    fontSize: size === 'sm' ? 12 : 13,
    padding: size === 'sm' ? `${sp.xs + 2}px ${sp.md}px` : `${sp.sm + 2}px ${sp.lg}px`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 150ms ease-out, background 150ms ease-out',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: sp.xs + 2,
    justifyContent: 'center',
  }
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff' },
    secondary: { background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent-subtle)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  )
}

// -------- Card surface ----------
interface CardProps {
  children: ReactNode
  style?: CSSProperties
}
export function Card({ children, style }: CardProps) {
  return (
    <div style={{
      padding: sp.xl,
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      ...style,
    }}>
      {children}
    </div>
  )
}

// -------- Heading row (title + optional action) ----------
interface HeadingProps {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}
export function Heading({ title, subtitle, action }: HeadingProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: sp.lg, marginBottom: sp.lg }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: subtitle ? sp.xs : 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// -------- Inline alert (info/success/warn/error) ----------
export function Alert({
  tone: t,
  children,
  style,
}: {
  tone: Tone
  children: ReactNode
  style?: CSSProperties
}) {
  const { fg, bg } = tone[t]
  return (
    <div style={{
      marginTop: sp.md,
      padding: `${sp.sm + 2}px ${sp.md}px`,
      fontSize: 12,
      color: fg,
      background: bg,
      borderRadius: 'var(--radius)',
      lineHeight: 1.5,
      ...style,
    }}>
      {children}
    </div>
  )
}

/** Max widths used across shielded surfaces. */
export const MAX_W = {
  card: 760,
  page: 1200,
} as const
