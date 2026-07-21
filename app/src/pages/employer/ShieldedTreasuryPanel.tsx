// Public → confidential deposit (Token-2022 CT) + demo mint faucet.

import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useConfidential } from '../../contexts/ConfidentialProvider'
import {
  CT_SYMBOL,
  applyPendingBalance,
  depositToConfidential,
  formatAmount,
  mintDemoTokens,
  readAvailableBalance,
  readPublicBalance,
} from '../../lib/confidential'
import { recordTreasury } from '../../lib/history'
import { Alert, Btn, Card, Heading, MAX_W, StatTile, sp } from '../../components/shielded/primitives'

type Phase = 'idle' | 'minting' | 'depositing' | 'applying' | 'done' | 'error'

export default function ShieldedTreasuryPanel() {
  const { status, mint, keys, sendTransaction } = useConfidential()
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [publicBal, setPublicBal] = useState<bigint | null>(null)
  const [available, setAvailable] = useState<bigint | null>(null)
  const [amount, setAmount] = useState('100')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastSig, setLastSig] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    if (!publicKey || !mint || !keys) return
    const [pub, avail] = await Promise.all([
      readPublicBalance(connection, publicKey, mint),
      readAvailableBalance(mint, publicKey, keys),
    ])
    setPublicBal(pub)
    setAvailable(avail)
  }, [publicKey, mint, keys, connection])

  useEffect(() => {
    refresh()
  }, [refresh, tick, status])

  const claimFaucet = async () => {
    if (!publicKey || !mint) return
    setPhase('minting')
    setError(null)
    try {
      const sig = await mintDemoTokens({
        connection,
        owner: publicKey,
        mint,
        amountUi: 1000,
        sendTransaction,
      })
      setLastSig(sig)
      recordTreasury(publicKey.toBase58(), {
        id: sig,
        timestamp: Math.floor(Date.now() / 1000),
        kind: 'faucet',
        amount: 1000,
        signature: sig,
      })
      setPhase('done')
      setTick((t) => t + 1)
    } catch (err: any) {
      setPhase('error')
      setError(err?.message ?? String(err))
    }
  }

  const deposit = async () => {
    if (!publicKey || !mint || !keys) return
    const ui = parseFloat(amount)
    if (!ui || ui <= 0) {
      setError('Enter a positive amount')
      return
    }
    setPhase('depositing')
    setError(null)
    try {
      const depSig = await depositToConfidential({
        connection,
        owner: publicKey,
        mint,
        amountUi: ui,
        sendTransaction,
      })
      setPhase('applying')
      const applySig = await applyPendingBalance({
        connection,
        owner: publicKey,
        mint,
        keys,
        sendTransaction,
      })
      setLastSig(applySig || depSig)
      recordTreasury(publicKey.toBase58(), {
        id: depSig,
        timestamp: Math.floor(Date.now() / 1000),
        kind: 'deposit',
        amount: ui,
        signature: depSig,
      })
      setPhase('done')
      setTick((t) => t + 1)
    } catch (err: any) {
      console.error('[CT treasury]', err)
      setPhase('error')
      setError(err?.message ?? String(err))
    }
  }

  if (status !== 'ready' || !mint) {
    return (
      <div style={{ maxWidth: MAX_W.card }}>
        <Alert tone="warn">
          Confidential treasury needs a Token-2022 CT mint and configured account.
          Use the status pill in the nav: create mint, then wait for ready.
        </Alert>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: MAX_W.card, display: 'grid', gap: sp.lg }}>
      <Heading
        title="Confidential treasury"
        subtitle={`Deposit public ${CT_SYMBOL} into your Token-2022 confidential balance. Amounts become ElGamal-encrypted on-chain.`}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp.md }}>
        <StatTile
          label="Public"
          value={publicBal == null ? '…' : `${formatAmount(publicBal)} ${CT_SYMBOL}`}
        />
        <StatTile
          label="Confidential available"
          value={available == null ? '…' : `${formatAmount(available)} ${CT_SYMBOL}`}
          tone="accent"
        />
      </div>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: sp.md, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Deposit amount
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              step="1"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <Btn
            variant="primary"
            disabled={phase === 'depositing' || phase === 'applying' || phase === 'minting'}
            onClick={deposit}
          >
            {phase === 'depositing' ? 'Depositing…' : phase === 'applying' ? 'Applying pending…' : 'Deposit + apply'}
          </Btn>
          <Btn
            variant="ghost"
            disabled={phase === 'minting'}
            onClick={claimFaucet}
          >
            {phase === 'minting' ? 'Minting…' : `Mint 1,000 ${CT_SYMBOL}`}
          </Btn>
          <Btn variant="ghost" onClick={() => setTick((t) => t + 1)}>Refresh</Btn>
        </div>
        {error && <Alert tone="err" style={{ marginTop: sp.md }}>{error}</Alert>}
        {lastSig && phase === 'done' && (
          <p style={{ fontSize: 12, marginTop: sp.md }}>
            Last tx{' '}
            <a
              href={`https://solscan.io/tx/${lastSig}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              {lastSig.slice(0, 8)}…
            </a>
          </p>
        )}
      </Card>
    </div>
  )
}
