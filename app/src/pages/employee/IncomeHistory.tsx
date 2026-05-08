// Employee income history. Honors PRIVACY.md:
//   - Decryption happens here, in the browser. The plaintext amount never leaves
//     the page. CSV export is built from an in-memory Blob.
//   - Network calls (Covalent or RPC) carry the wallet pubkey only — no names,
//     no decrypted figures.
//   - When the ConfidentialTransfer migration ships, swap decryptSalary for the
//     ElGamal viewing-key decrypt. The component shape does not change.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import TopNav from '../../components/TopNav'
import { useProgram } from '../../hooks/useProgram'
import { findEmployeePda, findOrganizationPda } from '../../lib/program'
import { decryptSalary } from '../../lib/salary_crypto'
import { getProgramTxsForWallet, type ProgramTx } from '../../lib/covalent'
import AnalyticsBanner from '../../components/AnalyticsBanner'

interface DecryptedRow {
  signature: string
  date: string
  amountUsd: number  // never sent over the network
}

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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
  const program = useProgram()
  const [txs, setTxs] = useState<ProgramTx[]>([])
  const [salaryUsd, setSalaryUsd] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!connected || !publicKey || !program) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const orgAuthority = localStorage.getItem('zalary_org_authority')
        if (!orgAuthority) throw new Error('No organization linked. Open the join link your employer sent you.')
        const [orgPda] = findOrganizationPda(new PublicKey(orgAuthority))
        const [employeePda] = findEmployeePda(orgPda, publicKey)
        const employee = await (program.account as unknown as { employee: { fetchNullable(p: PublicKey): Promise<{ encryptedSalary: number[] } | null> } }).employee.fetchNullable(employeePda)
        if (!employee) throw new Error('Employee record not found for this wallet.')
        const blob = Uint8Array.from(employee.encryptedSalary)
        const plaintext = await decryptSalary(blob, publicKey.toBase58())
        if (cancelled) return
        setSalaryUsd(plaintext)
        const fetched = await getProgramTxsForWallet(publicKey, 200)
        if (!cancelled) setTxs(fetched)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load income history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [connected, publicKey, program, reloadKey])

  const hasSalary = salaryUsd != null && Number.isFinite(salaryUsd) && salaryUsd >= 0.01

  const rows = useMemo<DecryptedRow[]>(() => {
    return txs
      .filter(tx => tx.success)
      .map(tx => ({
        signature: tx.signature,
        date: new Date(tx.blockTime * 1000).toISOString().slice(0, 10),
        amountUsd: hasSalary ? (salaryUsd as number) : 0,
      }))
  }, [txs, salaryUsd, hasSalary])

  const totalUsd = rows.reduce((sum, r) => sum + r.amountUsd, 0)
  const yearTotal = useMemo(() => byTaxYear(rows), [rows])

  if (!connected) {
    return (
      <div className="screen active">
        <TopNav variant="employee" />
        <main style={wrap}>
          <div className="treasury-card" style={{ textAlign: 'center' }}>
            <div className="label" style={{ marginBottom: 8 }}>Connect a wallet to view income history</div>
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

        {/* Hero — total earned */}
        <div className="balance-card-wrapper">
          <div className="balance-card-inner">
            <div className="balance-label">Total earned (decrypted locally)</div>
            <div className="balance-amount mono">{loading ? '—' : fmt(totalUsd)}</div>
            <div className="balance-caption">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Plaintext never leaves your browser
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
            <div className="stat-label">Program txs</div>
            <div className="stat-value">{rows.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Period salary</div>
            <div className="stat-value">{hasSalary ? fmt(salaryUsd as number) : 'Not set'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">This year</div>
            <div className="stat-value">{fmt(yearTotal[String(new Date().getFullYear())] ?? 0)}</div>
          </div>
        </div>

        {/* By tax year + CSV */}
        <div className="treasury-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>By tax year</h3>
            <ExportButton rows={rows} wallet={publicKey?.toBase58() ?? ''} />
          </div>
          {Object.keys(yearTotal).length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payments yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {Object.keys(yearTotal).sort().reverse().map(y => (
                <div key={y} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{y}</span>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(yearTotal[y])}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="treasury-card payment-history">
          <h3>Transaction history</h3>
          {rows.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : 'No on-chain activity yet for this wallet.'}
            </div>
          ) : (
            <div className="timeline">
              {rows.map(r => (
                <div className="timeline-item" key={r.signature}>
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <span className="timeline-date">{r.date}</span>
                      <span className="timeline-type">Zalary program</span>
                    </div>
                    <div className="timeline-bottom">
                      <a className="timeline-tx" href={SOLSCAN(r.signature)} target="_blank" rel="noreferrer">
                        {r.signature.slice(0, 8)}…{r.signature.slice(-6)}
                      </a>
                      <span className="timeline-amount mono">{fmt(r.amountUsd)}</span>
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

function ExportButton({ rows, wallet }: { rows: DecryptedRow[]; wallet: string }) {
  const onExport = () => {
    const header = 'date,signature,amount_usd\n'
    const body = rows.map(r => `${r.date},${r.signature},${r.amountUsd}`).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zalary-income-${wallet.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button
      onClick={onExport}
      disabled={rows.length === 0}
      style={{
        padding: '8px 14px',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--accent)',
        background: 'transparent',
        color: 'var(--accent)',
        fontSize: 13,
        fontWeight: 600,
        cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
        opacity: rows.length === 0 ? 0.5 : 1,
      }}
    >
      Download CSV
    </button>
  )
}

function byTaxYear(rows: DecryptedRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const year = r.date.slice(0, 4)
    out[year] = (out[year] ?? 0) + r.amountUsd
  }
  return out
}
