// Surfaces the Umbra registration state inline in the top nav. When the
// session is underfunded, exposes one-click "Fund session" + copy-pubkey
// fallback. The funding tx is signed by the user's main wallet via the
// regular wallet-adapter sendTransaction path.

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import { useUmbra } from '../contexts/UmbraProvider'
import { Btn, tone, sp } from './shielded/primitives'

const FUND_LAMPORTS = 0.05 * LAMPORTS_PER_SOL

const labels: Record<string, { text: string; t: keyof typeof tone }> = {
  idle: { text: 'Shielded layer: connect a wallet', t: 'muted' },
  'wallet-incompatible': { text: 'Shielded layer: needs Phantom or Backpack', t: 'warn' },
  'awaiting-session-signature': { text: 'Shielded layer: signing session…', t: 'accent' },
  'session-underfunded': { text: 'Shielded layer: fund session', t: 'warn' },
  'building-client': { text: 'Shielded layer: starting…', t: 'accent' },
  registering: { text: 'Shielded layer: registering…', t: 'accent' },
  'proving-anonymous': { text: 'Shielded layer: generating ZK proof…', t: 'accent' },
  ready: { text: 'Shielded layer: ready', t: 'ok' },
  error: { text: 'Shielded layer: error', t: 'err' },
}

export default function UmbraStatusPill() {
  const { status, error, registrationSignatures, sessionPubkey, retry } = useUmbra()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [copied, setCopied] = useState(false)
  const [funding, setFunding] = useState(false)
  const [fundError, setFundError] = useState<string | null>(null)

  const meta = labels[status] ?? labels.idle
  const colors = tone[meta.t]
  const tooltip =
    fundError ?? error ??
    (registrationSignatures.length
      ? `Registered: ${registrationSignatures.length} txs landed`
      : status === 'ready' ? 'Already registered on devnet' : '')

  const showFundingHelper = status === 'session-underfunded' && sessionPubkey
  const showRetry = status === 'error'

  const copy = async () => {
    if (!sessionPubkey) return
    try {
      await navigator.clipboard.writeText(sessionPubkey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const fundSession = async () => {
    if (!sessionPubkey || !publicKey || !sendTransaction) return
    setFunding(true)
    setFundError(null)
    try {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(sessionPubkey),
        lamports: FUND_LAMPORTS,
      }))
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, 'confirmed')
      retry()
    } catch (err: any) {
      setFundError(err?.message ?? String(err))
    } finally {
      setFunding(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: sp.sm }}>
      <span
        title={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: sp.xs + 2,
          padding: `${sp.xs}px ${sp.md - 2}px`,
          borderRadius: 'var(--radius-full)',
          background: colors.bg,
          color: colors.fg,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.02em',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
        {meta.text}
      </span>
      {showFundingHelper && (
        <>
          <Btn
            size="sm"
            onClick={fundSession}
            disabled={funding}
            title={fundError ?? `Send 0.05 devnet SOL to ${sessionPubkey}`}
          >
            {funding ? 'funding…' : 'Fund session (0.05 SOL)'}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={copy} title="Copy session pubkey">
            {copied ? 'copied' : `${sessionPubkey!.slice(0, 4)}…${sessionPubkey!.slice(-4)}`}
          </Btn>
        </>
      )}
      {showRetry && (
        <Btn variant="secondary" size="sm" onClick={retry}>retry</Btn>
      )}
    </span>
  )
}
