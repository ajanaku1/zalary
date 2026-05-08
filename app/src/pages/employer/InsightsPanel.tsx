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
import { getTreasuryBalanceHistory, isPortfolioAvailable, type BalancePoint } from '../../lib/covalent-balances'
import { getMultiFiat, isPricingAvailable, type FiatQuote, type FiatCode } from '../../lib/covalent-pricing'
import AnalyticsBanner from '../../components/AnalyticsBanner'
import { useHeliusLogStream } from '../../hooks/useHeliusLogStream'

interface Props {
  authority: PublicKey | null
}

export default function InsightsPanel({ authority }: Props) {
  const [txs, setTxs] = useState<ProgramTx[]>([])
  const [history, setHistory] = useState<BalancePoint[]>([])
  const [fiat, setFiat] = useState<FiatQuote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const liveEvent = useHeliusLogStream(true)

  // Real-time refresh: when a Zalary tx lands and it touched the treasury,
  // refetch Covalent rather than waiting for a manual reload. Push, not poll.
  useEffect(() => {
    if (liveEvent && liveEvent.instructions.some(i => i === 'runPayroll' || i === 'fundTreasury' || i === 'claimFunds')) {
      setReloadKey(k => k + 1)
    }
  }, [liveEvent])

  useEffect(() => {
    if (!authority) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [orgPda] = findOrganizationPda(authority)
        const [treasuryPda] = findTreasuryPda(orgPda)
        const [fetched, hist, quotes] = await Promise.all([
          getProgramTxsForWallet(treasuryPda, 200),
          isPortfolioAvailable() ? getTreasuryBalanceHistory(treasuryPda).catch(() => []) : Promise.resolve([]),
          isPricingAvailable() ? getMultiFiat().catch(() => []) : Promise.resolve([]),
        ])
        if (!cancelled) {
          setTxs(fetched)
          setHistory(hist)
          setFiat(quotes)
        }
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

      {/* Treasury balance trail (Covalent Portfolio v2) */}
      {history.length > 0 && (
        <div className="treasury-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
            Treasury USDC · 30d
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>via Covalent Portfolio v2</span>
          </h3>
          <BalanceSparkline points={history} />
        </div>
      )}

      {/* Fiat tile (Covalent Pricing) */}
      {fiat.length > 0 && (
        <div className="treasury-card">
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
            1 USDC in fiat
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>via Covalent Pricing · for receipts only, never on-chain</span>
          </h3>
          <div className="quick-stats">
            {fiat.map(q => (
              <div className="stat-card" key={q.currency}>
                <div className="stat-label">{q.currency}</div>
                <div className="stat-value">{formatFiat(q.pricePerUsdc, q.currency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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

function BalanceSparkline({ points }: { points: BalancePoint[] }) {
  const w = 600, h = 120, pad = 8
  const max = Math.max(...points.map(p => p.balance), 1)
  const min = Math.min(...points.map(p => p.balance), 0)
  const range = max - min || 1
  const path = points.map((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((p.balance - min) / range) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const last = points[points.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 120, display: 'block' }}>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <path d={`${path} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`} fill="url(#g)" opacity="0.18" />
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>{points[0]?.date}</span>
        <span className="mono">{last?.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC · {last?.date}</span>
      </div>
    </div>
  )
}

function formatFiat(price: number, currency: FiatCode): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(price)
  } catch {
    return price.toFixed(2)
  }
}

function withThreshold(n: number, threshold: number): string {
  if (n === 0) return '0'
  if (n < threshold) return `<${threshold}`
  return String(n)
}
