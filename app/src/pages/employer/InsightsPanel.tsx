// Employer Insights — metadata-only analytics. No salary plaintext on this page.
//
// Honors PRIVACY.md: queries Covalent (or RPC fallback) for txs touching the
// org treasury PDA, then derives counts, cadence, and inflow sources. The
// $-volume line is intentionally absent until the post-migration variant adds
// a viewing-key-only overlay decrypted in the employer's own browser.

import { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import Card from '../../components/Card'
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

  if (!authority) return <Card>Connect a wallet that owns an organization to view insights.</Card>
  if (loading) return <Card>Loading insights…</Card>
  if (error) return <Card><div style={{ color: 'var(--danger, #e74c3c)' }}>{error}</div></Card>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <AnalyticsBanner onChange={() => setReloadKey(k => k + 1)} />
      <Card>
        <h3 style={{ margin: 0, fontSize: 16 }}>Treasury activity</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 14px' }}>
          Metadata only. No on-chain amounts are read or displayed here.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label="Total Zalary txs" value={String(stats.total)} />
          <Stat label="This month" value={String(stats.thisMonth)} />
          <Stat label="Unique funders" value={withThreshold(stats.funders, 5)} />
          <Stat label="Total fees paid (SOL)" value={(stats.feeLamports / 1e9).toFixed(4)} />
        </div>
      </Card>
      <Card>
        <h3 style={{ margin: 0, fontSize: 16 }}>Cadence</h3>
        <CadenceList byMonth={stats.byMonth} />
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function CadenceList({ byMonth }: { byMonth: Record<string, number> }) {
  const months = Object.keys(byMonth).sort().reverse().slice(0, 6)
  if (months.length === 0) return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payroll runs yet.</div>
  const max = Math.max(...months.map(m => byMonth[m]))
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      {months.map(m => (
        <div key={m} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 30px', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span>{m}</span>
          <div style={{ height: 8, background: 'var(--card-alt, rgba(255,255,255,0.04))', borderRadius: 4 }}>
            <div style={{ width: `${(byMonth[m] / max) * 100}%`, height: '100%', background: 'var(--accent, #6c5ce7)', borderRadius: 4 }} />
          </div>
          <span style={{ textAlign: 'right' }}>{byMonth[m]}</span>
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
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
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
