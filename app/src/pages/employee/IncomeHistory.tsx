// Employee activity log. Honors PRIVACY.md.
//
// We deliberately do NOT display dollar amounts on this page. Two reasons:
//   1. Pre-ConfidentialTransfer migration, salary plaintext is a placeholder
//      we won't pretend is real income data.
//   2. Post-migration, transfer amounts are ElGamal-encrypted on-chain. The
//      amount can only be reconstructed by combining a wallet-signed
//      decryption with the per-tx ciphertext — work that lives on the
//      employee's device, not on a list page.
//
// What this page IS: a privacy-respecting activity log. Every Zalary program
// tx touching the connected wallet, with the date and signature. That's what
// the chain is willing to tell us; we don't fabricate the rest.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import TopNav from '../../components/TopNav'
import { getProgramTxsForWallet, type ProgramTx } from '../../lib/covalent'
import AnalyticsBanner from '../../components/AnalyticsBanner'

const SOLSCAN = (sig: string) => `https://solscan.io/tx/${sig}?cluster=devnet`

const wrap: CSSProperties = {
  paddingTop: 84,
  paddingLeft: 20,
  paddingRight: 20,
  paddingBottom: 60,
  display: 'grid',
  gap: 20,
  maxWidth: 720,
  margin: '0 auto',
}

export default function IncomeHistory() {
  const { publicKey, connected } = useWallet()
  const [txs, setTxs] = useState<ProgramTx[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!connected || !publicKey) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const fetched = await getProgramTxsForWallet(publicKey, 200)
        if (!cancelled) setTxs(fetched)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load activity')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [connected, publicKey, reloadKey])

  const successes = useMemo(() => txs.filter(t => t.success), [txs])
  const monthCount = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(1); cutoff.setHours(0, 0, 0, 0)
    const ts = cutoff.getTime() / 1000
    return successes.filter(t => t.blockTime >= ts).length
  }, [successes])

  if (!connected) {
    return (
      <div className="screen active">
        <TopNav variant="employee" />
        <main style={wrap}>
          <div className="treasury-card" style={{ textAlign: 'center' }}>
            <div className="label">Connect a wallet to view your activity log</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="screen active">
      <TopNav variant="employee" />
      <main style={wrap}>
        <AnalyticsBanner onChange={() => setReloadKey(k => k + 1)} />

        {/* Hero — program activity count, not income */}
        <div className="balance-card-wrapper">
          <div className="balance-card-inner">
            <div className="balance-label">Zalary program activity</div>
            <div className="balance-amount mono">{loading ? '—' : successes.length}</div>
            <div className="balance-caption">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Confirmed transactions touching your wallet
            </div>
          </div>
        </div>

        {error && (
          <div className="treasury-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="quick-stats">
          <div className="stat-card">
            <div className="stat-label">All time</div>
            <div className="stat-value">{successes.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">This month</div>
            <div className="stat-value">{monthCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Amounts</div>
            <div className="stat-value" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Encrypted</div>
          </div>
        </div>

        {/* Why no dollar amounts */}
        <div className="treasury-card" style={{ background: 'rgba(108,92,231,0.06)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Why no dollar amounts here?</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Salary amounts are encrypted on-chain via Token-2022 ConfidentialTransfer.
            Decrypting them requires your viewing key, which lives only on this device.
            For the dollar figure, check your wallet balance after a claim — the amount
            arrives in your USDC account, decrypted by the wallet itself.
          </p>
        </div>

        {/* Activity timeline */}
        <div className="treasury-card payment-history">
          <h3>Activity log</h3>
          {successes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : 'No on-chain Zalary activity yet for this wallet.'}
            </div>
          ) : (
            <div className="timeline">
              {successes.map(tx => (
                <div className="timeline-item" key={tx.signature}>
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <span className="timeline-date">{new Date(tx.blockTime * 1000).toISOString().slice(0, 10)}</span>
                      <span className="timeline-type">Zalary program</span>
                    </div>
                    <div className="timeline-bottom">
                      <a className="timeline-tx" href={SOLSCAN(tx.signature)} target="_blank" rel="noreferrer">
                        {tx.signature.slice(0, 10)}…{tx.signature.slice(-8)}
                      </a>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {(tx.fee / 1e9).toFixed(5)} SOL fee
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
