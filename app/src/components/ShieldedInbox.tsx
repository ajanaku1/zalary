// Employee confidential balance: apply pending, show available, withdraw to public.

import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useConfidential } from '../contexts/ConfidentialProvider'
import {
  CT_SYMBOL,
  applyPendingBalance,
  formatAmount,
  readAvailableBalance,
  readPublicBalance,
  withdrawFromConfidential,
} from '../lib/confidential'
import {
  Alert,
  Btn,
  Card,
  Eyebrow,
  Heading,
  MAX_W,
  StatTile,
  sp,
} from './shielded/primitives'

export default function ShieldedInbox() {
  const { status, mint, keys, sendTransaction, error: ctError } = useConfidential()
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [available, setAvailable] = useState<bigint | null>(null)
  const [publicBal, setPublicBal] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSig, setLastSig] = useState<string | null>(null)
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    if (!publicKey || !mint || !keys || status !== 'ready') return
    const [avail, pub] = await Promise.all([
      readAvailableBalance(mint, publicKey, keys),
      readPublicBalance(connection, publicKey, mint),
    ])
    setAvailable(avail)
    setPublicBal(pub)
  }, [publicKey, mint, keys, status, connection])

  useEffect(() => {
    refresh()
  }, [refresh, tick])

  const apply = async () => {
    if (!publicKey || !mint || !keys) return
    setBusy(true)
    setError(null)
    try {
      const sig = await applyPendingBalance({
        connection,
        owner: publicKey,
        mint,
        keys,
        sendTransaction,
      })
      setLastSig(sig)
      setTick((t) => t + 1)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    if (!publicKey || !mint || !keys) return
    const ui = parseFloat(withdrawAmt)
    if (!ui || ui <= 0) {
      setError('Enter a positive withdraw amount')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const sigs = await withdrawFromConfidential({
        connection,
        owner: publicKey,
        mint,
        amountUi: ui,
        keys,
        sendTransaction,
      })
      setLastSig(sigs[sigs.length - 1] ?? null)
      setTick((t) => t + 1)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: MAX_W.card, display: 'grid', gap: sp.lg }}>
      <Heading
        title="Confidential balance"
        subtitle="Token-2022 confidential transfers land in your pending encrypted balance. Apply to make them spendable, then withdraw to public for fiat off-ramp."
      />

      {status !== 'ready' && (
        <Alert tone="warn">
          {ctError ?? 'Configure Token-2022 CT via the status pill (employer shares mint; you sign once).'}
        </Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp.md }}>
        <StatTile
          label="Available (encrypted)"
          value={available == null ? '—' : `${formatAmount(available)} ${CT_SYMBOL}`}
          tone="accent"
        />
        <StatTile
          label="Public"
          value={publicBal == null ? '—' : `${formatAmount(publicBal)} ${CT_SYMBOL}`}
        />
      </div>

      {publicKey && (
        <Card>
          <Eyebrow>Your wallet</Eyebrow>
          <div className="mono" style={{ fontSize: 12 }}>{publicKey.toBase58()}</div>
          {mint && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: sp.xs }}>
              Mint {mint}
            </div>
          )}
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: sp.md, alignItems: 'center' }}>
          <Btn variant="primary" disabled={busy || status !== 'ready'} onClick={apply}>
            Apply pending balance
          </Btn>
          <Btn variant="ghost" disabled={busy} onClick={() => setTick((t) => t + 1)}>
            Refresh
          </Btn>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: sp.md, alignItems: 'flex-end', marginTop: sp.lg }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Withdraw to public
            </label>
            <input
              value={withdrawAmt}
              onChange={(e) => setWithdrawAmt(e.target.value)}
              type="number"
              min="0"
              placeholder="Amount"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <Btn variant="primary" disabled={busy || status !== 'ready'} onClick={withdraw}>
            Unshield
          </Btn>
        </div>
        {error && <Alert tone="err" style={{ marginTop: sp.md }}>{error}</Alert>}
        {lastSig && (
          <p style={{ fontSize: 12, marginTop: sp.md }}>
            <a href={`https://solscan.io/tx/${lastSig}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              View last tx
            </a>
          </p>
        )}
      </Card>
    </div>
  )
}
