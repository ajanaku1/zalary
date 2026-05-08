// Shared banner for the Insights / IncomeHistory pages. Two controls:
//
//   1. Source toggle — Covalent vs direct Solana RPC. Honors PRIVACY.md.
//      Switching to RPC removes the third-party dependency entirely.
//
//   2. Demo-mode toggle — Zalary lives on devnet, Covalent indexes mainnet
//      only. Without this toggle, judges visiting the live deploy see empty
//      Insights cards. With it on, Covalent queries run against a configured
//      showcase wallet and the integration is visible. Banner makes it
//      obvious which mode is active so showcase data isn't mistaken for the
//      user's own treasury.

import { useState } from 'react'
import {
  getAnalyticsMode,
  setAnalyticsMode,
  isCovalentAvailable,
  getDemoMode,
  setDemoMode,
  isShowcaseAvailable,
  type AnalyticsMode,
} from '../lib/covalent'

interface Props {
  onChange?: (mode: AnalyticsMode) => void
  onDemoChange?: (on: boolean) => void
}

export default function AnalyticsBanner({ onChange, onDemoChange }: Props) {
  const [mode, setMode] = useState<AnalyticsMode>(getAnalyticsMode())
  const [demoOn, setDemoOn] = useState<boolean>(getDemoMode())
  const covalentReady = isCovalentAvailable()
  const showcaseReady = isShowcaseAvailable()

  const toggleSource = () => {
    const next: AnalyticsMode = mode === 'covalent' ? 'rpc' : 'covalent'
    setAnalyticsMode(next)
    setMode(next)
    onChange?.(next)
  }

  const toggleDemo = () => {
    const next = !demoOn
    setDemoMode(next)
    setDemoOn(next)
    onDemoChange?.(next)
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>
          Source: <strong>{mode === 'covalent' ? 'Covalent (analytics enabled)' : 'Direct Solana RPC'}</strong>.
          Wallet pubkey is the only identifier sent. See <a href="/PRIVACY.md">PRIVACY.md</a>.
        </span>
        <button
          onClick={toggleSource}
          disabled={!covalentReady && mode === 'rpc'}
          title={!covalentReady ? 'Covalent unavailable on devnet or no API key set' : undefined}
          style={btnStyle(covalentReady)}
        >
          {mode === 'covalent' ? 'Switch to RPC' : 'Switch to Covalent'}
        </button>
      </div>
      {covalentReady && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: '1px solid rgba(108,92,231,0.18)', paddingTop: 8, marginTop: 4 }}>
          <span>
            {demoOn
              ? <>Demo mode: <strong style={{ color: 'var(--accent)' }}>showing mainnet showcase wallet</strong>. Your devnet treasury is hidden.</>
              : <>Zalary runs on devnet. Toggle demo mode to populate the Covalent surfaces with mainnet showcase data.</>}
          </span>
          <button
            onClick={toggleDemo}
            disabled={!showcaseReady}
            title={!showcaseReady ? 'Set VITE_DEMO_SHOWCASE_WALLET_SOL to a mainnet wallet' : undefined}
            style={btnStyle(showcaseReady)}
          >
            {demoOn ? 'Exit demo' : 'Enter demo'}
          </button>
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  padding: 12,
  background: 'rgba(108,92,231,0.08)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-secondary)',
  display: 'grid',
  gap: 8,
}

function btnStyle(enabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  }
}
