// Confidential payroll: Token-2022 CT transfer per employee (amount hidden).

import { useCallback, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useConfidential } from '../../contexts/ConfidentialProvider'
import { CT_SYMBOL, confidentialPayrollTransfer } from '../../lib/confidential'
import { recordPayroll } from '../../lib/history'
import {
  Alert,
  Btn,
  Card,
  Heading,
  MAX_W,
  StatusLabel,
  sp,
} from '../../components/shielded/primitives'

export interface ShieldedPayrollEmployee {
  name: string
  walletFull: string
  salary: number
}

type RowPhase = 'idle' | 'transferring' | 'done' | 'error'

interface RowStatus {
  phase: RowPhase
  message?: string
  sig?: string
}

export default function ShieldedPayrollPanel({ employees }: { employees: ShieldedPayrollEmployee[] }) {
  const { status, mint, keys, sendTransaction } = useConfidential()
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [rows, setRows] = useState<Record<string, RowStatus>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = employees.reduce((s, e) => s + (e.salary || 0), 0)

  const setRow = (wallet: string, patch: Partial<RowStatus>) => {
    setRows((prev) => {
      const base: RowStatus = prev[wallet] ?? { phase: 'idle' }
      return { ...prev, [wallet]: { ...base, ...patch } }
    })
  }

  const run = useCallback(async () => {
    if (!publicKey || !mint || !keys || status !== 'ready') return
    if (employees.length === 0) {
      setError('Add employees first')
      return
    }
    setRunning(true)
    setError(null)
    let paid = 0
    let lastSig: string | null = null

    for (const emp of employees) {
      if (!emp.walletFull || !emp.salary) continue
      setRow(emp.walletFull, { phase: 'transferring', message: 'Generating ZK proofs…' })
      try {
        const sigs = await confidentialPayrollTransfer({
          connection,
          owner: publicKey,
          mint,
          destinationOwner: emp.walletFull,
          amountUi: emp.salary,
          keys,
          sendTransaction,
        })
        lastSig = sigs[sigs.length - 1] ?? null
        paid += emp.salary
        setRow(emp.walletFull, {
          phase: 'done',
          message: 'Disbursed',
          sig: lastSig ?? undefined,
        })
      } catch (err: any) {
        console.error('[CT payroll]', emp.walletFull, err)
        setRow(emp.walletFull, {
          phase: 'error',
          message: err?.message ?? String(err),
        })
      }
    }

    if (paid > 0 && publicKey) {
      const doneCount = employees.filter((e) => e.salary > 0).length
      recordPayroll(publicKey.toBase58(), {
        id: lastSig ?? `run-${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
        totalAmount: paid,
        employeeCount: doneCount,
        signature: lastSig,
      })
    }
    setRunning(false)
  }, [publicKey, mint, keys, status, employees, connection, sendTransaction, rows])

  if (status !== 'ready') {
    return (
      <Alert tone="warn">
        Shielded payroll needs Token-2022 CT ready (nav pill green). Recipients must open Zalary once to configure their confidential token account.
      </Alert>
    )
  }

  return (
    <div style={{ maxWidth: MAX_W.card, display: 'grid', gap: sp.lg }}>
      <Heading
        title="Confidential payroll run"
        subtitle={`Transfer ${total.toLocaleString()} ${CT_SYMBOL} with Token-2022 confidential transfers. Amounts stay encrypted; recipient addresses remain public (CT property).`}
      />

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sp.md }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {employees.length} recipient{employees.length === 1 ? '' : 's'} · {total.toLocaleString()} {CT_SYMBOL}
          </div>
          <Btn variant="primary" disabled={running || employees.length === 0} onClick={run}>
            {running ? 'Running…' : 'Run confidential payroll'}
          </Btn>
        </div>

        {employees.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No employees yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: sp.sm }}>
            {employees.map((emp) => {
              const row = rows[emp.walletFull] ?? { phase: 'idle' as const }
              const tone =
                row.phase === 'done' ? 'ok'
                  : row.phase === 'error' ? 'err'
                    : row.phase === 'transferring' ? 'accent'
                      : 'muted'
              return (
                <div
                  key={emp.walletFull}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: sp.md,
                    padding: `${sp.sm}px ${sp.md}px`,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--bg-base)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {emp.walletFull.slice(0, 6)}…{emp.walletFull.slice(-4)}
                    </div>
                    {row.message && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {row.message}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: sp.md }}>
                    <span className="mono" style={{ fontSize: 13 }}>
                      {emp.salary.toLocaleString()} {CT_SYMBOL}
                    </span>
                    <StatusLabel tone={tone}>
                      {row.phase === 'idle' ? 'Queued' : row.phase}
                    </StatusLabel>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {error && <Alert tone="err" style={{ marginTop: sp.md }}>{error}</Alert>}
      </Card>
    </div>
  )
}
