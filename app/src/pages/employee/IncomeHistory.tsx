// Employee income history. Honors PRIVACY.md:
//   - Decryption happens here, in the browser. The plaintext amount never leaves
//     the page. CSV export is built from an in-memory Blob.
//   - Network calls (Covalent or RPC) carry the wallet pubkey only — no names,
//     no decrypted figures.
//   - When the ConfidentialTransfer migration ships, swap decryptSalary for the
//     ElGamal viewing-key decrypt. The component shape does not change.

import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import TopNav from '../../components/TopNav'
import Card from '../../components/Card'
import { useProgram } from '../../hooks/useProgram'
import { findEmployeePda, findOrganizationPda } from '../../lib/program'
import { decryptSalary } from '../../lib/salary_crypto'
import { getProgramTxsForWallet, type ProgramTx } from '../../lib/covalent'
import AnalyticsBanner from '../../components/AnalyticsBanner'

interface DecryptedRow {
  signature: string
  date: string
  amountUsd: number  // never sent over the network
  status: 'success' | 'failed'
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

  const rows = useMemo<DecryptedRow[]>(() => {
    if (salaryUsd == null) return []
    return txs
      .filter(tx => tx.success)
      .map(tx => ({
        signature: tx.signature,
        date: new Date(tx.blockTime * 1000).toISOString().slice(0, 10),
        amountUsd: salaryUsd,
        status: 'success' as const,
      }))
  }, [txs, salaryUsd])

  const totalUsd = rows.reduce((sum, r) => sum + r.amountUsd, 0)
  const yearTotal = useMemo(() => byTaxYear(rows), [rows])

  if (!connected) {
    return (
      <div className="screen active">
        <TopNav variant="employee" />
        <main style={{ padding: 20 }}>
          <Card>Connect your wallet to view income history.</Card>
        </main>
      </div>
    )
  }

  return (
    <div className="screen active">
      <TopNav variant="employee" />
      <main style={{ padding: 20, display: 'grid', gap: 16 }}>
        <AnalyticsBanner onChange={() => setReloadKey(k => k + 1)} />
        <Card>
          <h2 style={{ margin: 0, fontSize: 18 }}>Income history</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 16px' }}>
            Decrypted in your browser. Amounts never touch the network.
          </p>
          {loading && <div>Loading…</div>}
          {error && <div style={{ color: 'var(--danger, #e74c3c)' }}>{error}</div>}
          {!loading && !error && (
            <>
              <Summary total={totalUsd} count={rows.length} salary={salaryUsd} />
              <YearBreakdown yearTotal={yearTotal} />
              <ExportButton rows={rows} wallet={publicKey?.toBase58() ?? ''} />
              <TxTable rows={rows} />
            </>
          )}
        </Card>
      </main>
    </div>
  )
}

function Summary({ total, count, salary }: { total: number; count: number; salary: number | null }) {
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
      <Stat label="Total earned" value={fmt(total)} />
      <Stat label="Payments" value={String(count)} />
      <Stat label="Period salary" value={salary != null ? fmt(salary) : '—'} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function YearBreakdown({ yearTotal }: { yearTotal: Record<string, number> }) {
  const years = Object.keys(yearTotal).sort().reverse()
  if (years.length === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>By tax year</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {years.map(y => (
          <span key={y} style={{ padding: '4px 10px', background: 'var(--card-alt, rgba(255,255,255,0.04))', borderRadius: 6, fontSize: 13 }}>
            {y}: {yearTotal[y].toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </span>
        ))}
      </div>
    </div>
  )
}

function TxTable({ rows }: { rows: DecryptedRow[] }) {
  if (rows.length === 0) return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payments yet.</div>
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(r => (
        <div key={r.signature} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 12, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span>{r.date}</span>
          <a href={`https://solscan.io/tx/${r.signature}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            {r.signature.slice(0, 8)}…{r.signature.slice(-6)}
          </a>
          <span style={{ fontWeight: 600 }}>
            {r.amountUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </span>
        </div>
      ))}
    </div>
  )
}

function ExportButton({ rows, wallet }: { rows: DecryptedRow[]; wallet: string }) {
  const onExport = () => {
    const header = 'date,signature,amount_usd,status\n'
    const body = rows.map(r => `${r.date},${r.signature},${r.amountUsd},${r.status}`).join('\n')
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
      style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}
    >
      Download CSV (built locally)
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
