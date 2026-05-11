// Surface 2: Public → Encrypted treasury deposit.
//
// Top of the Treasury tab. Shows the shielded session's public dUSDC balance,
// the Umbra encrypted balance for that mint, a deposit form, and a one-click
// faucet for first-time users.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { address } from '@solana/kit'
import {
  getEncryptedBalanceQuerierFunction,
  getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
} from '@umbra-privacy/sdk'
import { useUmbra } from '../../contexts/UmbraProvider'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { recordTreasury } from '../../lib/history'
import {
  UMBRA_DEMO_MINT,
  UMBRA_DEMO_MINT_DECIMALS,
  UMBRA_DEMO_MINT_SYMBOL,
  claimFromFaucet,
} from '../../lib/umbra'
import {
  Alert,
  Btn,
  Card,
  Heading,
  MAX_W,
  StatTile,
  sp,
} from '../../components/shielded/primitives'

type DepositPhase = 'idle' | 'submitting' | 'confirming' | 'done' | 'error'

function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) { setSeconds(0); return }
    const start = Date.now()
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 500)
    return () => clearInterval(id)
  }, [active])
  return seconds
}

function formatAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toLocaleString()}${fracStr ? '.' + fracStr : ''}`
}

export default function ShieldedTreasuryPanel() {
  const { client, sessionPubkey, status } = useUmbra()
  const { publicKey: employerWallet } = useWallet()
  const { connection } = useConnection()
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null)
  const [encryptedBalance, setEncryptedBalance] = useState<bigint | null>(null)
  const [encryptedState, setEncryptedState] = useState<string>('')
  const [amount, setAmount] = useState('100')
  const [phase, setPhase] = useState<DepositPhase>('idle')
  const [signatures, setSignatures] = useState<{ queue?: string; callback?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [faucetState, setFaucetState] = useState<{ phase: 'idle' | 'claiming' | 'ok' | 'err'; message: string }>({ phase: 'idle', message: '' })
  const elapsed = useElapsed(phase === 'submitting')

  const claimFaucet = useCallback(async () => {
    if (!sessionPubkey) return
    setFaucetState({ phase: 'claiming', message: '' })
    const result = await claimFromFaucet(sessionPubkey, 'dUSDC')
    if (result.ok) {
      setFaucetState({ phase: 'ok', message: '+1,000 dUSDC dropped — refreshing balance…' })
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        setRefreshTick((t) => t + 1)
      }
      setFaucetState({ phase: 'idle', message: '' })
    } else {
      setFaucetState({ phase: 'err', message: result.message })
    }
  }, [sessionPubkey])

  const sessionPk = useMemo(
    () => (sessionPubkey ? new PublicKey(sessionPubkey) : null),
    [sessionPubkey],
  )
  const ata = useMemo(() => {
    if (!sessionPk) return null
    return getAssociatedTokenAddressSync(new PublicKey(UMBRA_DEMO_MINT), sessionPk, true, TOKEN_PROGRAM_ID)
  }, [sessionPk])

  useEffect(() => {
    if (!ata) { setPublicBalance(null); return }
    let cancelled = false
    connection.getTokenAccountBalance(ata, 'confirmed')
      .then((res) => { if (!cancelled) setPublicBalance(BigInt(res.value.amount)) })
      .catch(() => { if (!cancelled) setPublicBalance(0n) })
    return () => { cancelled = true }
  }, [ata, connection, refreshTick])

  useEffect(() => {
    if (!client || !sessionPubkey) { setEncryptedBalance(null); setEncryptedState(''); return }
    let cancelled = false
    const query = getEncryptedBalanceQuerierFunction({ client })
    const mintAddr = address(UMBRA_DEMO_MINT)
    void query([mintAddr])
      .then((results) => {
        if (cancelled) return
        const entry: any = results.get(mintAddr) ?? Array.from(results.values())[0]
        if (entry?.state === 'shared' && typeof entry.balance === 'bigint') {
          setEncryptedBalance(entry.balance); setEncryptedState('shared')
        } else {
          setEncryptedBalance(null); setEncryptedState(entry?.state ?? 'unknown')
        }
      })
      .catch(() => { if (!cancelled) setEncryptedState('unreadable') })
    return () => { cancelled = true }
  }, [client, sessionPubkey, refreshTick])

  const deposit = useCallback(async () => {
    if (!client || !sessionPubkey) return
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive amount')
      setPhase('error')
      return
    }
    const baseUnits = BigInt(Math.round(parsed * 10 ** UMBRA_DEMO_MINT_DECIMALS))
    if (publicBalance !== null && baseUnits > publicBalance) {
      setError(`Public balance is only ${formatAmount(publicBalance, UMBRA_DEMO_MINT_DECIMALS)} ${UMBRA_DEMO_MINT_SYMBOL}`)
      setPhase('error')
      return
    }
    setError(null)
    setSignatures({})
    setPhase('submitting')
    try {
      const fn = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client })
      const result = await fn(
        address(sessionPubkey),
        address(UMBRA_DEMO_MINT),
        baseUnits as any,
      )
      const r: any = result
      setSignatures({ queue: r?.queueSignature, callback: r?.callbackSignature })
      setPhase('done')
      setRefreshTick((t) => t + 1)
      if (employerWallet) {
        recordTreasury(employerWallet.toBase58(), {
          id: `tr-${Date.now()}`,
          timestamp: Math.floor(Date.now() / 1000),
          kind: 'deposit',
          amount: parsed,
          signature: r?.callbackSignature ?? r?.queueSignature ?? null,
        })
      }
    } catch (err: any) {
      console.error('[ShieldedTreasury] deposit failed', err)
      setError(err?.cause?.message ?? err?.message ?? String(err))
      setPhase('error')
    }
  }, [amount, client, sessionPubkey, publicBalance, employerWallet])

  if (status !== 'ready' && status !== 'proving-anonymous') {
    return (
      <Card style={{ maxWidth: MAX_W.card, marginBottom: sp.xxl, padding: `${sp.lg}px ${sp.xl}px` }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Shielded treasury becomes available once the shielded layer pill turns green.
        </div>
      </Card>
    )
  }

  const publicReadable = publicBalance !== null
    ? formatAmount(publicBalance, UMBRA_DEMO_MINT_DECIMALS)
    : '—'
  const encryptedReadable = encryptedBalance !== null
    ? formatAmount(encryptedBalance, UMBRA_DEMO_MINT_DECIMALS)
    : encryptedState === 'shared'
      ? '0'
      : `(${encryptedState || 'unreadable'})`

  return (
    <Card style={{ maxWidth: MAX_W.card, marginBottom: sp.xxl }}>
      <Heading
        title="Shielded treasury"
        subtitle={`Move ${UMBRA_DEMO_MINT_SYMBOL} from your public session balance into your encrypted balance on Umbra. Amounts deposited become invisible on-chain.`}
        action={
          <Btn
            variant="secondary"
            size="sm"
            onClick={claimFaucet}
            disabled={faucetState.phase === 'claiming'}
            title="Claims 1,000 dUSDC from Umbra's devnet faucet. Rate-limited to once per hour per wallet."
          >
            {faucetState.phase === 'claiming' ? 'claiming…' : `Claim 1,000 ${UMBRA_DEMO_MINT_SYMBOL}`}
          </Btn>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp.md, marginBottom: sp.lg }}>
        <StatTile label={`Public ${UMBRA_DEMO_MINT_SYMBOL}`} value={publicReadable} />
        <StatTile label={`Encrypted ${UMBRA_DEMO_MINT_SYMBOL}`} value={encryptedReadable} tone="accent" />
      </div>

      <div style={{ display: 'flex', gap: sp.sm, alignItems: 'center' }}>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={phase === 'submitting'}
          style={{
            flex: 1,
            padding: `${sp.sm + 2}px ${sp.md}px`,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-base)',
            fontSize: 14,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <Btn
          onClick={deposit}
          disabled={phase === 'submitting' || !publicBalance || publicBalance === 0n}
        >
          {phase === 'submitting' ? `Shielding… ${elapsed}s` : `Shield ${UMBRA_DEMO_MINT_SYMBOL}`}
        </Btn>
      </div>

      {phase === 'submitting' && (
        <Alert tone="muted">
          {elapsed < 8 && 'Submitting deposit tx to the Umbra program…'}
          {elapsed >= 8 && elapsed < 30 && 'Tx submitted. Waiting for Arcium MPC nodes to compute the encrypted-balance update.'}
          {elapsed >= 30 && elapsed < 75 && `Arcium MPC still computing (${elapsed}s). Devnet can take up to 90s.`}
          {elapsed >= 75 && elapsed < 120 && `Still waiting (${elapsed}s). Devnet is slower than usual.`}
          {elapsed >= 120 && `Over 2 minutes — the MPC computation may have stalled. Refresh and retry.`}
        </Alert>
      )}
      {faucetState.phase === 'err' && faucetState.message && (
        <Alert tone="warn">Faucet: {faucetState.message}</Alert>
      )}
      {faucetState.phase === 'ok' && <Alert tone="ok">{faucetState.message}</Alert>}
      {phase === 'error' && error && <Alert tone="err">{error}</Alert>}
      {phase === 'done' && (
        <Alert tone="ok">
          Shielded. Queue tx{' '}
          <a className="mono" target="_blank" rel="noopener noreferrer" href={`https://explorer.solana.com/tx/${signatures.queue}?cluster=devnet`} style={{ color: 'inherit' }}>
            {signatures.queue?.slice(0, 8)}…
          </a>
          {signatures.callback && (
            <>
              {' · '}callback{' '}
              <a className="mono" target="_blank" rel="noopener noreferrer" href={`https://explorer.solana.com/tx/${signatures.callback}?cluster=devnet`} style={{ color: 'inherit' }}>
                {signatures.callback.slice(0, 8)}…
              </a>
            </>
          )}
        </Alert>
      )}
    </Card>
  )
}
