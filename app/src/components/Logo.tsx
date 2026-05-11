interface LogoProps {
  /** Total height in pixels. Mark scales proportionally; wordmark sits to its right. */
  size?: number
  /** Hide the "alary" wordmark (mark only — useful for tight spaces / favicons). */
  iconOnly?: boolean
  /** Override the wordmark color (defaults to current text color via inherit). */
  wordmarkColor?: string
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export default function Logo({
  size = 28,
  iconOnly = false,
  wordmarkColor,
  className,
  style,
  onClick,
}: LogoProps) {
  // Mark intrinsic ratio is 140:200 → width = size * 0.7
  const markWidth = Math.round(size * 0.7)
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(2, Math.round(size * 0.12)),
        lineHeight: 1,
        userSelect: 'none',
        ...style,
      }}
    >
      <img
        src="/zalary-mark.svg"
        alt=""
        width={markWidth}
        height={size}
        style={{ display: 'block' }}
      />
      {!iconOnly && (
        <span
          style={{
            fontFamily: "'JetBrains Mono', 'DM Mono', 'SF Mono', ui-monospace, Menlo, monospace",
            fontWeight: 700,
            fontSize: Math.round(size * 0.72),
            letterSpacing: '-0.5px',
            color: wordmarkColor ?? 'inherit',
          }}
        >
          .alary
        </span>
      )}
    </div>
  )
}
