// Surface 3: Shielded payroll run.

import { useCallback, useMemo, useState } from 'react'
import { address } from '@solana/kit'
import {
  getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction,
  getUserAccountQuerierFunction,
} from '@umbra-privacy/sdk'
import { getCreateReceiverClaimableUtxoFromEncryptedBalanceProver } from '@umbra-privacy/web-zk-prover'
import { useUmbra } from '../../contexts/UmbraProvider'
import {
  UMBRA_DEMO_MINT,
  UMBRA_DEMO_MINT_DECIMALS,
  UMBRA_DEMO_MINT_SYMBOL,
} from '../../lib/umbra'
import {
  Alert,
  Btn,
  Card,
  Heading,
  MAX_W,
  StatusLabel,
  sp,
} from '../../components/shielded/primitives'
import type { Tone } from '../../components/shielded/primitives'

type RowStatus =
  | { phase: 'pending' }
  | { phase: 'validating' }
  | { phase: 'invalid'; reason: string }
  | { phase: 'proving' }
  | { phase: 'submitting' }
  | { phase: 'awaiting-callback' }
  | { phase: 'done'; queueSig: string; callbackSig?: string }
  | { phase: 'error'; message: string }

export interface ShieldedPayrollEmployee {
  name: string
  walletFull: string
  salary: number
}

const rowTone = (p: RowStatus['phase']): Tone => {
  if (p === 'done') return 'ok'
  if (p === 'invalid' || p === 'error') return 'err'
  if (p === 'pending') return 'muted'
  return 'accent'
}

const rowLabel = (s: RowStatus): string => {
  switch (s.phase) {
    case 'pending': return 'Queued'
    case 'validating': return 'Checking Umbra registration…'
    case 'invalid': return 'Skipped'
    case 'proving': return 'Generating ZK proof…'
    case 'submitting': return 'Submitting + Arcium MPC…'
    case 'awaiting-callback': return 'Waiting for finalization…'
    case 'done': return 'Disbursed'
    case 'error': return 'Failed'
  }
}

interface Props {
  employees: ShieldedPayrollEmployee[]
}

export default function ShieldedPayrollPanel({ employees }: Props) {
  const { client, status, anonymousReady, ensureAnonymous } = useUmbra()
  const [rows, setRows] = useState<Record<string, RowStatus>>({})
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'running' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const payable = employees.filter((e) => e.salary > 0)
  const missingSalaries = employees.length - payable.length

  const total = useMemo(
    () => payable.reduce((sum, e) => sum + e.salary, 0),
    [payable],
  )

  const setRow = (key: string, s: RowStatus) =>
    setRows((prev) => ({ ...prev, [key]: s }))

  const run = useCallback(async () => {
    if (!client || running) return
    setRunning(true)
    setPhase('preparing')
    setError(null)
    setRows({})
    try {
      const ok = await ensureAnonymous()
      if (!ok) throw new Error('Anonymous-mode registration failed; cannot create UTXOs.')

      const zkProver = getCreateReceiverClaimableUtxoFromEncryptedBalanceProver()
      const createUtxo = getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction({ client }, { zkProver })
      const queryUser = getUserAccountQuerierFunction({ client })
      const mint = address(UMBRA_DEMO_MINT)
      setPhase('running')

      for (const emp of payable) {
        const key = emp.walletFull
        try {
          setRow(key, { phase: 'validating' })
          const recipient = address(emp.walletFull)
          let accountResult: any = await queryUser(recipient)
          const x25519Registered = (acc: any) =>
            acc?.data?.isUserAccountX25519KeyRegistered === true ||
            acc?.data?.isX25519PubkeyRegistered === true
          let isRegistered = accountResult?.state === 'exists' && x25519Registered(accountResult)
          if (!isRegistered && accountResult?.state === 'exists') {
            await new Promise((r) => setTimeout(r, 8000))
            accountResult = await queryUser(recipient)
            isRegistered = accountResult?.state === 'exists' && x25519Registered(accountResult)
          }
          if (!isRegistered) {
            const detail = accountResult?.state === 'non_existent'
              ? 'No Umbra account on-chain. Open Zalary as that wallet first.'
              : accountResult?.state === 'exists'
                ? 'Account exists but encryption key registration never finalized.'
                : `state: ${accountResult?.state ?? 'unknown'}`
            setRow(key, { phase: 'invalid', reason: detail })
            continue
          }

          setRow(key, { phase: 'submitting' })
          const baseUnits = BigInt(Math.round(emp.salary * 10 ** UMBRA_DEMO_MINT_DECIMALS))
          const result: any = await createUtxo({
            amount: baseUnits as any,
            destinationAddress: recipient,
            mint,
          })
          setRow(key, { phase: 'done', queueSig: result.queueSignature, callbackSig: result.callbackSignature })
        } catch (err: any) {
          console.error('[ShieldedPayroll] row failed', emp.walletFull, err)
          setRow(key, { phase: 'error', message: err?.cause?.message ?? err?.message ?? String(err) })
        }
      }
      setPhase('done')
    } catch (err: any) {
      console.error('[ShieldedPayroll] run failed', err)
      setError(err?.message ?? String(err))
      setPhase('error')
    } finally {
      setRunning(false)
    }
  }, [client, payable, ensureAnonymous, running])

  if (!client || (status !== 'ready' && status !== 'proving-anonymous')) {
    return (
      <Card style={{ maxWidth: MAX_W.card }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Connect a wallet and finish the shielded session setup before running shielded payroll.
        </div>
      </Card>
    )
  }

  if (employees.length === 0) {
    return (
      <Card style={{ maxWidth: MAX_W.card }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Add employees on the Team tab before running shielded payroll.
        </div>
      </Card>
    )
  }

  if (payable.length === 0) {
    return (
      <Card style={{ maxWidth: MAX_W.card }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {employees.length} employee{employees.length === 1 ? '' : 's'} on file, but none have a salary set yet.
          Open <strong>Team → click an employee → Save salary</strong>, then come back.
        </div>
      </Card>
    )
  }

  const buttonLabel =
    phase === 'preparing' ? (anonymousReady ? 'Preparing…' : 'Generating ZK setup…')
    : phase === 'running' ? 'Running…'
    : 'Run shielded payroll'

  return (
    <Card style={{ maxWidth: MAX_W.card }}>
      <Heading
        title="Shielded payroll run"
        subtitle={`Disburse ${total.toLocaleString()} ${UMBRA_DEMO_MINT_SYMBOL} from your encrypted balance into one receiver-claimable UTXO per employee. Amounts and the link between you and each recipient stay invisible on-chain.`}
        action={<Btn onClick={run} disabled={running}>{buttonLabel}</Btn>}
      />

      {missingSalaries > 0 && (
        <Alert tone="muted">
          {missingSalaries} employee{missingSalaries === 1 ? ' has' : 's have'} no salary set and will be skipped.
        </Alert>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: sp.sm, marginTop: sp.md }}>
        {payable.map((emp) => {
          const row = rows[emp.walletFull] ?? { phase: 'pending' as const }
          return <RowView key={emp.walletFull} employee={emp} row={row} />
        })}
      </div>

      {phase === 'error' && error && <Alert tone="err">{error}</Alert>}
    </Card>
  )
}

function RowView({ employee, row }: { employee: ShieldedPayrollEmployee; row: RowStatus }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${sp.sm + 2}px ${sp.md}px`,
      background: 'var(--bg-base)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{employee.name}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {employee.walletFull
            ? `${employee.walletFull.slice(0, 6)}…${employee.walletFull.slice(-4)}`
            : 'no wallet'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: sp.md }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
          {employee.salary.toLocaleString()} {UMBRA_DEMO_MINT_SYMBOL}
        </span>
        <StatusLabel tone={rowTone(row.phase)}>{rowLabel(row)}</StatusLabel>
        {row.phase === 'done' && row.queueSig && (
          <a
            href={`https://explorer.solana.com/tx/${row.queueSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="mono"
            style={{ fontSize: 11, color: 'var(--accent)' }}
          >
            tx ↗
          </a>
        )}
        {row.phase === 'invalid' && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 220, textAlign: 'right' }}>{row.reason}</span>
        )}
        {row.phase === 'error' && (
          <span style={{ fontSize: 11, color: '#ff4757', maxWidth: 220, textAlign: 'right' }}>{row.message}</span>
        )}
      </div>
    </div>
  )
}
