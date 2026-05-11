// Surface 4 + 5 (employee). Read-only shielded inbox.
//
// The live claim path is disabled. Umbra's BatchMerkleVerifier circuit
// asserts deterministically on every devnet attempt — single-UTXO batches,
// multi-UTXO batches, and retries all fail at the same template line. The
// scanner decrypts correctly so the inbox demonstrates Umbra's privacy
// property, but the receiver-to-encrypted-balance claim transition is
// upstream-broken on devnet at the time of submission.
//
// Withdrawal (encrypted → public) still ships because its tx path is direct
// and doesn't hit the same circuit.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { address } from '@solana/kit'
import {
  getClaimableUtxoScannerFunction,
  getEncryptedBalanceQuerierFunction,
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
} from '@umbra-privacy/sdk'
import { useConnection } from '@solana/wallet-adapter-react'
import { useUmbra } from '../contexts/UmbraProvider'
import {
  UMBRA_DEMO_MINT,
  UMBRA_DEMO_MINT_DECIMALS,
  UMBRA_DEMO_MINT_SYMBOL,
} from '../lib/umbra'
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

interface IncomingUtxo {
  key: string
  amount: bigint
}

function formatAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toLocaleString()}${fracStr ? '.' + fracStr : ''}`
}

function SessionPubkeyRow({ pubkey, ready }: { pubkey: string; ready: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!ready) return
    try {
      await navigator.clipboard.writeText(pubkey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <div style={{
      marginTop: sp.md,
      padding: `${sp.sm + 2}px ${sp.md}px`,
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: sp.md,
    }}>
      <div style={{ minWidth: 0 }}>
        <Eyebrow color={ready ? undefined : '#ffa502'}>
          {ready ? 'Your session pubkey' : 'Registration pending'}
        </Eyebrow>
        <div className="mono" style={{
          fontSize: 12,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          opacity: ready ? 1 : 0.5,
        }}>{pubkey}</div>
      </div>
      <Btn variant={ready ? 'primary' : 'ghost'} size="sm" disabled={!ready} onClick={copy}>
        {!ready ? 'Pending' : copied ? 'Copied' : 'Copy'}
      </Btn>
    </div>
  )
}

export default function ShieldedInbox() {
  const { client, sessionPubkey, status } = useUmbra()
  const { connection } = useConnection()
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  // Cache the last scan in sessionStorage so the user doesn't have to rescan
  // every login — the UTXO amounts are derivable from the same session
  // keypair, so they're safe to keep in-tab.
  const cacheKey = sessionPubkey ? `zalary.inbox.scan.${sessionPubkey}` : null
  const [incoming, setIncoming] = useState<IncomingUtxo[]>(() => {
    if (!cacheKey) return []
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return parsed.map((u: any) => ({ key: u.key, amount: BigInt(u.amount) }))
    } catch { return [] }
  })
  const [encryptedBalance, setEncryptedBalance] = useState<bigint | null>(null)
  const [encryptedState, setEncryptedState] = useState<string>('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null)

  const ata = useMemo(() => {
    if (!sessionPubkey) return null
    return getAssociatedTokenAddressSync(
      new PublicKey(UMBRA_DEMO_MINT),
      new PublicKey(sessionPubkey),
      true,
      TOKEN_PROGRAM_ID,
    )
  }, [sessionPubkey])

  useEffect(() => {
    if (!ata) { setPublicBalance(null); return }
    let cancelled = false
    connection.getTokenAccountBalance(ata, 'confirmed')
      .then((res) => { if (!cancelled) setPublicBalance(BigInt(res.value.amount)) })
      .catch(() => { if (!cancelled) setPublicBalance(0n) })
    return () => { cancelled = true }
  }, [ata, connection, refreshTick])

  useEffect(() => {
    if (!client || !sessionPubkey) { setEncryptedBalance(null); return }
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

  const scan = useCallback(async () => {
    if (!client) return
    setScanning(true)
    setScanError(null)
    try {
      const scanner = getClaimableUtxoScannerFunction({ client })
      const result: any = await scanner(0n as any, 0n as any)
      const received = [
        ...((result?.received ?? []) as any[]),
        ...((result?.publicReceived ?? []) as any[]),
      ]
      const next = received.map((u, i) => ({
        key: `${u?.commitmentIndex ?? i}`,
        amount: BigInt(u?.amount ?? 0),
      }))
      setIncoming(next)
      if (cacheKey) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(next.map((u) => ({ key: u.key, amount: u.amount.toString() }))))
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      setScanError(err?.message ?? String(err))
    } finally {
      setScanning(false)
    }
  }, [client])

  const withdraw = useCallback(async () => {
    if (!client || !sessionPubkey || !encryptedBalance || encryptedBalance === 0n) return
    setWithdrawing(true)
    setWithdrawError(null)
    setWithdrawTx(null)
    try {
      const withdrawFn = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client })
      const result: any = await withdrawFn(
        address(sessionPubkey),
        address(UMBRA_DEMO_MINT),
        encryptedBalance as any,
      )
      setWithdrawTx(result?.callbackSignature ?? result?.queueSignature)
      setRefreshTick((t) => t + 1)
    } catch (err: any) {
      setWithdrawError(err?.cause?.message ?? err?.message ?? String(err))
    } finally {
      setWithdrawing(false)
    }
  }, [client, sessionPubkey, encryptedBalance])

  if (!client || (status !== 'ready' && status !== 'proving-anonymous')) {
    return (
      <Card style={{ maxWidth: MAX_W.card, padding: `${sp.lg}px ${sp.xl}px` }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Connect your wallet and finish the shielded session setup to receive shielded payroll.
        </div>
      </Card>
    )
  }

  const encryptedReadable = encryptedBalance !== null
    ? formatAmount(encryptedBalance, UMBRA_DEMO_MINT_DECIMALS)
    : encryptedState === 'shared' ? '0' : '—'
  const publicReadable = publicBalance !== null
    ? formatAmount(publicBalance, UMBRA_DEMO_MINT_DECIMALS)
    : '—'

  return (
    <Card style={{ maxWidth: MAX_W.card }}>
      <Heading
        title="Shielded inbox"
        subtitle="Incoming shielded payments addressed to your session pubkey."
      />

      {status === 'ready' && sessionPubkey && (
        <Alert tone="ok">
          <strong>Ready to receive payroll.</strong> Copy the pubkey below and share it with your employer.
        </Alert>
      )}
      {sessionPubkey && <SessionPubkeyRow pubkey={sessionPubkey} ready={status === 'ready'} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp.md, marginTop: sp.lg, marginBottom: sp.lg }}>
        <StatTile
          label={`Encrypted ${UMBRA_DEMO_MINT_SYMBOL}`}
          value={encryptedReadable}
          subtitle="Hidden on-chain — your shielded balance"
          tone="accent"
        />
        <StatTile
          label={`Public ${UMBRA_DEMO_MINT_SYMBOL}`}
          value={publicReadable}
          subtitle="Visible — what off-ramps see"
        />
      </div>

      <div style={{ display: 'flex', gap: sp.sm, marginBottom: sp.lg }}>
        <Btn onClick={scan} disabled={scanning}>
          {scanning ? 'Scanning…' : incoming.length > 0 ? 'Re-scan inbox' : 'Scan inbox'}
        </Btn>
        <Btn
          variant="secondary"
          onClick={withdraw}
          disabled={withdrawing || !encryptedBalance || encryptedBalance === 0n}
          title={!encryptedBalance
            ? 'No encrypted balance to unshield yet'
            : 'Move encrypted balance to your public ATA so it can be off-ramped'}
        >
          {withdrawing ? 'Withdrawing…' : 'Unshield → public ATA'}
        </Btn>
      </div>

      {scanError && <Alert tone="err">Scan failed: {scanError}</Alert>}
      {withdrawError && <Alert tone="err">Withdraw failed: {withdrawError}</Alert>}
      {withdrawTx && (
        <Alert tone="ok">
          Unshielded.{' '}
          <a
            className="mono"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://explorer.solana.com/tx/${withdrawTx}?cluster=devnet`}
            style={{ color: 'inherit' }}
          >
            {withdrawTx.slice(0, 8)}…
          </a>
        </Alert>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: sp.sm, marginTop: sp.md }}>
        {incoming.length === 0 && !scanning && (
          <div style={{
            padding: sp.xl,
            fontSize: 13,
            color: 'var(--text-muted)',
            textAlign: 'center',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            No shielded payments yet. Click "Scan inbox" to check the Umbra mixer tree.
          </div>
        )}
        {incoming.map((u) => (
          <div key={u.key} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${sp.sm + 2}px ${sp.md}px`,
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}>
            <div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                +{formatAmount(u.amount, UMBRA_DEMO_MINT_DECIMALS)} {UMBRA_DEMO_MINT_SYMBOL}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Decrypted from Umbra UTXO · sender hidden on-chain
              </div>
            </div>
          </div>
        ))}
      </div>

      {incoming.length > 0 && (
        <div style={{ marginTop: sp.md, fontSize: 11, color: 'var(--text-muted)' }}>
          Live claim is disabled in this build (devnet circuit flake). Decrypted amounts shown above prove the recipient can read what was sent.
        </div>
      )}
    </Card>
  )
}
