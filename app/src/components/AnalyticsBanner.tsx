// Shared banner that surfaces the analytics data source and lets the user
// toggle between Covalent and direct RPC. Honors PRIVACY.md: switching to RPC
// removes the third-party dependency entirely. Slower, same privacy floor.

import { useState } from 'react'
import { getAnalyticsMode, setAnalyticsMode, isCovalentAvailable, type AnalyticsMode } from '../lib/covalent'

interface Props {
  onChange?: (mode: AnalyticsMode) => void
}

export default function AnalyticsBanner({ onChange }: Props) {
  const [mode, setMode] = useState<AnalyticsMode>(getAnalyticsMode())
  const covalentReady = isCovalentAvailable()

  const toggle = () => {
    const next: AnalyticsMode = mode === 'covalent' ? 'rpc' : 'covalent'
    setAnalyticsMode(next)
    setMode(next)
    onChange?.(next)
  }

  return (
    <div style={{ padding: 12, background: 'rgba(108,92,231,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <span>
        Source: <strong>{mode === 'covalent' ? 'Covalent (analytics enabled)' : 'Direct Solana RPC'}</strong>.
        Wallet pubkey is the only identifier sent. See <a href="/PRIVACY.md">PRIVACY.md</a>.
      </span>
      <button
        onClick={toggle}
        disabled={!covalentReady && mode === 'rpc'}
        title={!covalentReady ? 'Covalent unavailable on devnet or no API key set' : undefined}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          cursor: covalentReady ? 'pointer' : 'not-allowed',
          opacity: covalentReady ? 1 : 0.5,
        }}
      >
        {mode === 'covalent' ? 'Switch to RPC' : 'Switch to Covalent'}
      </button>
    </div>
  )
}
