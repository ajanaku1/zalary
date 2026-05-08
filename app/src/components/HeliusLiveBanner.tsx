// Floating toast that announces the most recent program tx, pushed live via
// Helius logs WebSocket. Auto-hides after 8s. Click to dismiss or open Solscan.

import { useEffect, useState } from 'react'
import { useHeliusLogStream } from '../hooks/useHeliusLogStream'

export default function HeliusLiveBanner() {
  const event = useHeliusLogStream(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!event) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 8000)
    return () => clearTimeout(t)
  }, [event])

  if (!event || !visible) return null

  const label = event.instructions[0] ?? 'Zalary tx'
  return (
    <div
      onClick={() => setVisible(false)}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: 'var(--surface, #1a1a24)',
        border: '1px solid var(--accent, #6c5ce7)',
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        maxWidth: 320,
        cursor: 'pointer',
        animation: 'slide-in-right 240ms var(--ease-out, ease-out)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--success, #00b894)', boxShadow: '0 0 8px var(--success, #00b894)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Live · Helius</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{humanize(label)}</div>
      <a
        href={`https://solscan.io/tx/${event.signature}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mono"
        style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
      >
        {event.signature.slice(0, 10)}…{event.signature.slice(-8)}
      </a>
    </div>
  )
}

function humanize(name: string): string {
  // 'runPayroll' -> 'Run payroll'
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()
}
