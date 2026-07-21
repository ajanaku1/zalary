// Confidential balance summary (Token-2022 CT available + public balances).

import { useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useConfidential } from '../contexts/ConfidentialProvider'
import {
  CT_SYMBOL,
  formatAmount,
  readAvailableBalance,
  readPublicBalance,
} from '../lib/confidential'
import { Card, Eyebrow, StatTile, Btn, sp } from './shielded/primitives'

export default function ShieldedBalanceCard() {
  const { status, mint, keys } = useConfidential()
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [available, setAvailable] = useState<bigint | null>(null)
  const [publicBal, setPublicBal] = useState<bigint | null>(null)

  useEffect(() => {
    if (!publicKey || !mint || !keys || status !== 'ready') {
      setAvailable(null)
      setPublicBal(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const [avail, pub] = await Promise.all([
        readAvailableBalance(mint, publicKey, keys),
        readPublicBalance(connection, publicKey, mint),
      ])
      if (!cancelled) {
        setAvailable(avail)
        setPublicBal(pub)
      }
    })()
    return () => { cancelled = true }
  }, [publicKey, mint, keys, status, connection])

  const goTreasury = () => {
    window.dispatchEvent(new CustomEvent('zalary:goto-tab', { detail: 'treasury' }))
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: sp.lg }}>
        <div style={{ flex: 1 }}>
          <Eyebrow>Confidential treasury</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp.md, marginTop: sp.sm }}>
            <StatTile
              label="Available (encrypted)"
              value={available == null ? '—' : `${formatAmount(available)} ${CT_SYMBOL}`}
              subtitle="Token-2022 CT"
              tone="accent"
            />
            <StatTile
              label="Public balance"
              value={publicBal == null ? '—' : `${formatAmount(publicBal)} ${CT_SYMBOL}`}
              subtitle="Pre-deposit / post-withdraw"
            />
          </div>
          {mint && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: sp.md }}>
              Mint {mint.slice(0, 8)}…{mint.slice(-6)}
            </div>
          )}
        </div>
        <Btn variant="ghost" size="sm" onClick={goTreasury}>Manage →</Btn>
      </div>
      {status !== 'ready' && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: `${sp.md}px 0 0` }}>
          Complete Token-2022 confidential account setup (pill in the nav) to see balances.
        </p>
      )}
    </Card>
  )
}
