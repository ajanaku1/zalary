// Mint-level auditor ElGamal key (Token-2022 ConfidentialTransferMint).

import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useConfidential } from '../../contexts/ConfidentialProvider'
import { getAuditorElgamalPubkey, updateMintAuditor } from '../../lib/confidential'
import {
  Alert,
  Btn,
  Card,
  Heading,
  MAX_W,
  sp,
} from '../../components/shielded/primitives'

export default function ShieldedCompliancePanel() {
  const { status, mint, sendTransaction } = useConfidential()
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [auditor, setAuditor] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!mint) {
      setCurrent(null)
      return
    }
    const pk = await getAuditorElgamalPubkey(mint)
    setCurrent(pk ?? null)
  }, [mint])

  useEffect(() => {
    refresh()
  }, [refresh, status])

  const issue = async () => {
    if (!publicKey || !mint) return
    const trimmed = auditor.trim()
    if (!trimmed) {
      setError('Paste the auditor ElGamal pubkey (base58 address form from their CT setup).')
      return
    }
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const sig = await updateMintAuditor({
        connection,
        owner: publicKey,
        mint,
        auditorElgamalPubkey: trimmed,
        sendTransaction,
      })
      setOk(sig)
      setAuditor('')
      await refresh()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    if (!publicKey || !mint) return
    setBusy(true)
    setError(null)
    try {
      await updateMintAuditor({
        connection,
        owner: publicKey,
        mint,
        auditorElgamalPubkey: null,
        sendTransaction,
      })
      await refresh()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  if (status !== 'ready' || !mint) {
    return (
      <Alert tone="warn">
        Compliance controls require a Token-2022 confidential mint (create via the nav pill).
      </Alert>
    )
  }

  return (
    <div style={{ maxWidth: MAX_W.card, display: 'grid', gap: sp.lg }}>
      <Heading
        title="Auditor / viewing key"
        subtitle="Token-2022 Confidential Transfer mints support an optional auditor ElGamal key. The auditor can decrypt transfer amounts without holding employee keys. Clear to remove."
      />

      <Card>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: sp.sm }}>
          Current auditor ElGamal pubkey
        </div>
        <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', marginBottom: sp.lg }}>
          {current ?? '— none set —'}
        </div>

        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
          New auditor ElGamal pubkey
        </label>
        <input
          value={auditor}
          onChange={(e) => setAuditor(e.target.value)}
          placeholder="Base58 ElGamal pubkey"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg-base)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            marginBottom: sp.md,
          }}
        />
        <div style={{ display: 'flex', gap: sp.sm }}>
          <Btn variant="primary" disabled={busy} onClick={issue}>
            {busy ? 'Updating…' : 'Set auditor'}
          </Btn>
          <Btn variant="ghost" disabled={busy || !current} onClick={clear}>
            Clear
          </Btn>
        </div>
        {error && <Alert tone="err" style={{ marginTop: sp.md }}>{error}</Alert>}
        {ok && (
          <p style={{ fontSize: 12, marginTop: sp.md, color: 'var(--success)' }}>
            Updated · {ok.slice(0, 12)}…
          </p>
        )}
      </Card>
    </div>
  )
}
