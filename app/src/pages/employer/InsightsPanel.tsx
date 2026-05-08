// Employer Insights — metadata-only analytics. No salary plaintext on this page.
//
// Honors PRIVACY.md: queries Covalent (or RPC fallback) for txs touching the
// org treasury PDA, then derives counts, cadence, and inflow sources. Amounts
// are intentionally absent — pre-migration the visible-amount path is a
// distraction from the privacy story; post-migration the amounts are
// ElGamal ciphertext that no indexer (Covalent included) can read.

import { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { findOrganizationPda, findTreasuryPda } from '../../lib/program'
import { getProgramTxsForWallet, type ProgramTx } from '../../lib/covalent'
import AnalyticsBanner from '../../components/AnalyticsBanner'

interface Props {
  authority: PublicKey | null
}

export default function InsightsPanel({ authority }: Props) {
  const [txs, setTxs] = useState<ProgramTx[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!authority) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [orgPda] = findOrganizationPda(authority)
        const [treasuryPda] = findTreasuryPda(orgPda)
        const fetched = await getProgramTxsForWallet(treasuryPda, 200)
        if (!cancelled) setTxs(fetched)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load insights')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authority, reloadKey])

  const stats = useMemo(() => deriveStats(txs), [txs])

  if (!authority) {
    return (
      <div className="treasury-card" style={{ textAlign: 'center' }}>
        <div className="label">Connect a wallet that owns an organization to view insights.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <AnalyticsBanner onChange={() => setReloadKey(k => k + 1)} />

      {/* Hero — total treasury activity */}
      <div className="balance-card-wrapper">
        <div className="balance-card-inner">
          <div className="balance-label">Treasury program activity</div>
          <div className="balance-amount mono">{loading ? '—' : stats.total}</div>
          <div className="balance-caption">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Confirmed Zalary txs touching the treasury PDA
          </div>
        </div>
      </div>

      {error && (
        <div className="treasury-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Quick stats */}
      <div className="quick-stats">
        <div className="stat-card">
          <div className="stat-label">This month</div>
          <div className="stat-value">{stats.thisMonth}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unique funders</div>
          <div className="stat-value">{withThreshold(stats.funders, 5)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total fees (SOL)</div>
          <div className="stat-value">{(stats.feeLamports / 1e9).toFixed(4)}</div>
        </div>
      </div>

      {/* Privacy explainer */}
      <div className="treasury-card" style={{ background: 'rgba(108,92,231,0.06)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Why no payroll volume here?</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Treasury balance and per-payroll amounts move into Token-2022 ConfidentialTransfer
          ciphertext on mainnet. This dashboard reports the public metadata graph — counts,
          timestamps, fees — but never reads or guesses the dollar value behind a tx. For the
          actual treasury balance, see the Treasury tab (your wallet decrypts it locally).
        </p>
      </div>

      {/* Cadence */}
      <div className="treasury-card">
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Cadence</h3>
        <CadenceList byMonth={stats.byMonth} loading={loading} />
      </div>
    </div>
  )
}

function CadenceList({ byMonth, loading }: { byMonth: Record<string, number>; loading: boolean }) {
  const months = Object.keys(byMonth).sort().reverse().slice(0, 6)
  if (months.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{loading ? 'Loading…' : 'No payroll runs yet.'}</div>
  }
  const max = Math.max(...months.map(m => byMonth[m]))
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {months.map(m => (
        <div key={m} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 36px', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{m}</span>
          <div style={{ height: 10, background: 'var(--bg-base)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{
              width: `${(byMonth[m] / max) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent), var(--accent-warm))',
              borderRadius: 5,
              transition: 'width 600ms var(--ease-out, ease-out)',
            }} />
          </div>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{byMonth[m]}</span>
        </div>
      ))}
    </div>
  )
}

interface Stats {
  total: number
  thisMonth: number
  funders: number
  feeLamports: number
  byMonth: Record<string, number>
}

function deriveStats(txs: ProgramTx[]): Stats {
  const successes = txs.filter(t => t.success)
  const monthStart = new Date()
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const monthCutoff = monthStart.getTime() / 1000

  const funders = new Set<string>()
  const byMonth: Record<string, number> = {}
  let feeLamports = 0
  for (const tx of successes) {
    funders.add(tx.feePayer)
    feeLamports += tx.fee
    const ym = new Date(tx.blockTime * 1000).toISOString().slice(0, 7)
    byMonth[ym] = (byMonth[ym] ?? 0) + 1
  }
  return {
    total: successes.length,
    thisMonth: successes.filter(t => t.blockTime >= monthCutoff).length,
    funders: funders.size,
    feeLamports,
    byMonth,
  }
}

function withThreshold(n: number, threshold: number): string {
  if (n === 0) return '0'
  if (n < threshold) return `<${threshold}`
  return String(n)
}
