import { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useConfidential } from '../contexts/ConfidentialProvider'
import { tone } from './shielded/primitives'

const LABELS: Record<string, { text: string; t: keyof typeof tone }> = {
  idle: { text: 'Token-2022 CT: connect wallet', t: 'muted' },
  'wallet-incompatible': { text: 'Token-2022 CT: needs signMessage wallet', t: 'warn' },
  'needs-mint': { text: 'Token-2022 CT: create mint', t: 'warn' },
  'deriving-keys': { text: 'Token-2022 CT: deriving keys…', t: 'accent' },
  'configuring-account': { text: 'Token-2022 CT: configuring…', t: 'accent' },
  ready: { text: 'Token-2022 CT: ready', t: 'ok' },
  error: { text: 'Token-2022 CT: error', t: 'err' },
}

export default function ConfidentialStatusPill() {
  const { status, error, mint, retry, createMint } = useConfidential()
  const { publicKey } = useWallet()
  const { connection: _c } = useConnection()
  const [busy, setBusy] = useState(false)
  const meta = LABELS[status] ?? LABELS.idle
  const colors = tone[meta.t]

  const onCreate = async () => {
    setBusy(true)
    try {
      await createMint()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span
        title={error ?? mint ?? undefined}
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          background: colors.bg,
          color: colors.fg,
          whiteSpace: 'nowrap',
        }}
      >
        {meta.text}
      </span>
      {status === 'needs-mint' && publicKey && (
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#fff',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Creating…' : 'Create CT mint'}
        </button>
      )}
      {(status === 'error' || status === 'needs-mint') && (
        <button
          type="button"
          onClick={retry}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 8px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}
