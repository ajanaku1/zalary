// Compact dashboard widget — public dUSDC + encrypted dUSDC at-a-glance.
// Read-only; users hit Treasury to actually move funds.

import { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { address } from '@solana/kit'
import { getEncryptedBalanceQuerierFunction } from '@umbra-privacy/sdk'
import { useConnection } from '@solana/wallet-adapter-react'
import { useUmbra } from '../contexts/UmbraProvider'
import {
  UMBRA_DEMO_MINT,
  UMBRA_DEMO_MINT_DECIMALS,
  UMBRA_DEMO_MINT_SYMBOL,
} from '../lib/umbra'
import { Btn, Card, Eyebrow, StatTile, sp } from './shielded/primitives'

function formatAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toLocaleString()}${fracStr ? '.' + fracStr : ''}`
}

export default function ShieldedBalanceCard() {
  const { client, sessionPubkey, status } = useUmbra()
  const { connection } = useConnection()
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null)
  const [encryptedBalance, setEncryptedBalance] = useState<bigint | null>(null)
  const [encryptedState, setEncryptedState] = useState<string>('')

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
  }, [ata, connection])

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
  }, [client, sessionPubkey])

  const publicReadable = publicBalance !== null
    ? formatAmount(publicBalance, UMBRA_DEMO_MINT_DECIMALS)
    : '—'
  const encryptedReadable = encryptedBalance !== null
    ? formatAmount(encryptedBalance, UMBRA_DEMO_MINT_DECIMALS)
    : encryptedState === 'shared' ? '0' : status === 'ready' ? '—' : '…'

  return (
    <Card style={{ marginBottom: sp.xxl }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sp.md }}>
        <div>
          <Eyebrow>Shielded session</Eyebrow>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Treasury balances</div>
        </div>
        <Btn
          variant="secondary"
          size="sm"
          onClick={() => {
            const ev = new CustomEvent('zalary:goto-tab', { detail: 'treasury' })
            window.dispatchEvent(ev)
          }}
        >
          Manage →
        </Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sp.md }}>
        <StatTile
          label={`Public ${UMBRA_DEMO_MINT_SYMBOL}`}
          value={publicReadable}
          subtitle="Visible on-chain — funds before shielding"
        />
        <StatTile
          label={`Encrypted ${UMBRA_DEMO_MINT_SYMBOL}`}
          value={encryptedReadable}
          subtitle="Hidden on-chain — payroll runs from here"
          tone="accent"
        />
      </div>
    </Card>
  )
}
