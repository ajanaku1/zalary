import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PublicKey } from '@solana/web3.js'
import { useConfidential } from '../../contexts/ConfidentialProvider'
import { storeMint } from '../../lib/confidential'
import { buildJoinTx } from '../../lib/payroll-invites'

type JoinStep = 'invite' | 'awaiting-ct' | 'name' | 'processing' | 'success' | 'error'

export default function JoinOrg() {
  const [searchParams] = useSearchParams()
  const orgWallet = searchParams.get('org')
  const orgName = searchParams.get('name') || 'Unknown Organization'
  const mintParam = searchParams.get('mint')
  const [step, setStep] = useState<JoinStep>('invite')
  const [txSignature, setTxSignature] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [employeeName, setEmployeeName] = useState('')
  const { publicKey, sendTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const { status: ctStatus, error: ctError, retry: ctRetry, mint } = useConfidential()

  const orgWalletPubkey = useMemo(() => {
    if (!orgWallet) return null
    try { return new PublicKey(orgWallet) } catch { return null }
  }, [orgWallet])

  const truncatedAddress = useMemo(() => {
    if (!publicKey) return ''
    const addr = publicKey.toBase58()
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }, [publicKey])

  // Persist employer mint so ConfidentialProvider can configure the employee ATA.
  useEffect(() => {
    if (!mintParam || !publicKey) return
    try {
      localStorage.setItem('zalary.ct.shared_mint', mintParam)
      storeMint(publicKey.toBase58(), mintParam)
      ctRetry()
    } catch { /* ignore */ }
  }, [mintParam, publicKey, ctRetry])

  useEffect(() => {
    if (step !== 'awaiting-ct') return
    if (ctStatus === 'ready') setStep('name')
  }, [step, ctStatus])

  const handleConfirmJoin = useCallback(async () => {
    if (!publicKey || !orgWalletPubkey) return
    if (!employeeName.trim()) {
      setErrorMsg('Enter your name first.')
      return
    }
    setStep('processing')
    setErrorMsg(null)
    try {
      // Join memo carries employee wallet (CT recipient). No Umbra session.
      const tx = buildJoinTx(
        publicKey,
        orgWalletPubkey,
        decodeURIComponent(orgName),
        employeeName.trim(),
        publicKey.toBase58(),
      )
      const sig = await sendTransaction(tx, connection)
      try { await connection.confirmTransaction(sig, 'confirmed') } catch { /* tolerate */ }
      setTxSignature(sig)
      setStep('success')
    } catch (err: unknown) {
      console.error('[JoinOrg] join failed:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Transaction failed')
      setStep('error')
    }
  }, [publicKey, orgWalletPubkey, employeeName, orgName, sendTransaction, connection])

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    background: 'var(--bg, #0a0a0f)',
  }
  const cardStyle: React.CSSProperties = {
    maxWidth: 460, width: '100%', padding: 32,
    background: 'var(--bg-card, #16161e)',
    borderRadius: 16, border: '1px solid var(--border, #2a2a36)',
  }

  if (!orgWallet || !orgWalletPubkey) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Invalid invite</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>This join link is missing a valid org wallet.</p>
          <Link to="/" style={{ color: 'var(--accent)' }}>Back home</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Join {decodeURIComponent(orgName)}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
          Connect your wallet, configure Token-2022 confidential transfers, then send a join memo to the employer.
        </p>

        {step === 'invite' && (
          <>
            {!connected ? (
              <WalletMultiButton />
            ) : (
              <>
                <p style={{ fontSize: 13, marginBottom: 16 }}>Connected as <span className="mono">{truncatedAddress}</span></p>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setStep('awaiting-ct')}
                >
                  Continue
                </button>
              </>
            )}
          </>
        )}

        {step === 'awaiting-ct' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Status: <span className="mono">{ctStatus}</span>
              {mint && <> · mint {mint.slice(0, 6)}…</>}
            </p>
            {ctError && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{ctError}</p>}
            {ctStatus === 'needs-mint' && !mintParam && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                This invite has no mint parameter. Ask your employer to share a link that includes <span className="mono">?mint=…</span>, or paste their mint after they create it.
              </p>
            )}
            <button type="button" className="btn-outline" onClick={ctRetry} style={{ width: '100%' }}>
              Retry CT setup
            </button>
          </div>
        )}

        {step === 'name' && (
          <>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your name</label>
            <input
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Ada Lovelace"
              style={{
                width: '100%', marginTop: 6, marginBottom: 16, padding: '12px 14px',
                borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-base)',
                color: 'var(--text-primary)',
              }}
            />
            {errorMsg && <p style={{ color: 'var(--error)', fontSize: 13 }}>{errorMsg}</p>}
            <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={handleConfirmJoin}>
              Join organization
            </button>
          </>
        )}

        {step === 'processing' && <p style={{ fontSize: 14 }}>Sending join transaction…</p>}

        {step === 'success' && (
          <div>
            <p style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 8 }}>You&apos;re on the roster</p>
            {txSignature && (
              <a href={`https://solscan.io/tx/${txSignature}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 13 }}>
                View transaction
              </a>
            )}
            <div style={{ marginTop: 16 }}>
              <Link to="/employee" style={{ color: 'var(--accent)' }}>Open employee portal →</Link>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div>
            <p style={{ color: 'var(--error)', marginBottom: 12 }}>{errorMsg}</p>
            <button type="button" className="btn-outline" onClick={() => setStep('name')}>Try again</button>
          </div>
        )}
      </div>
    </div>
  )
}
