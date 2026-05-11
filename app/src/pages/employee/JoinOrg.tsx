import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useUmbra } from '../../contexts/UmbraProvider'
import { buildJoinTx } from '../../lib/payroll-invites'

const FUND_LAMPORTS = 0.05 * LAMPORTS_PER_SOL

type JoinStep = 'invite' | 'awaiting-session' | 'name' | 'processing' | 'success' | 'error'

export default function JoinOrg() {
  const [searchParams] = useSearchParams()
  const orgWallet = searchParams.get('org')
  const orgName = searchParams.get('name') || 'Unknown Organization'
  const [step, setStep] = useState<JoinStep>('invite')
  const [txSignature, setTxSignature] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [employeeName, setEmployeeName] = useState('')
  const { publicKey, sendTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const { sessionPubkey, status: umbraStatus, error: umbraError, retry: umbraRetry } = useUmbra()
  const [funding, setFunding] = useState(false)
  const [fundError, setFundError] = useState<string | null>(null)

  const orgWalletPubkey = useMemo(() => {
    if (!orgWallet) return null
    try { return new PublicKey(orgWallet) } catch { return null }
  }, [orgWallet])

  const truncatedAddress = useMemo(() => {
    if (!publicKey) return ''
    const addr = publicKey.toBase58()
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }, [publicKey])

  const truncatedSession = useMemo(() => {
    if (!sessionPubkey) return ''
    return `${sessionPubkey.slice(0, 6)}...${sessionPubkey.slice(-4)}`
  }, [sessionPubkey])

  // Advance from "invite" → "awaiting-session" once the user clicks Continue.
  // From "awaiting-session" → "name" once Umbra finishes registration.
  useEffect(() => {
    if (step !== 'awaiting-session') return
    if (umbraStatus === 'ready' && sessionPubkey) setStep('name')
  }, [step, umbraStatus, sessionPubkey])

  const fundSession = useCallback(async () => {
    if (!sessionPubkey || !publicKey) return
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
      umbraRetry()
    } catch (err: any) {
      setFundError(err?.message ?? String(err))
    } finally {
      setFunding(false)
    }
  }, [sessionPubkey, publicKey, sendTransaction, connection, umbraRetry])

  const handleConfirmJoin = useCallback(async () => {
    if (!publicKey || !orgWalletPubkey || !sessionPubkey) return
    if (!employeeName.trim()) {
      setErrorMsg('Enter your name first.')
      return
    }
    setStep('processing')
    setErrorMsg(null)
    try {
      const tx = buildJoinTx(publicKey, orgWalletPubkey, decodeURIComponent(orgName), employeeName.trim(), sessionPubkey)
      const sig = await sendTransaction(tx, connection)
      // Best-effort confirm; UI proceeds either way once the RPC accepts the sig
      try { await connection.confirmTransaction(sig, 'confirmed') } catch { /* RPC race tolerated */ }
      setTxSignature(sig)
      setStep('success')
    } catch (err: unknown) {
      console.error('[JoinOrg] join failed:', err)
      const message = err instanceof Error ? err.message : 'Transaction failed'
      setErrorMsg(message)
      setStep('error')
    }
  }, [publicKey, orgWalletPubkey, sessionPubkey, employeeName, orgName, sendTransaction, connection])

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    background: 'var(--bg, #0a0a0f)',
  }
  const cardStyle: React.CSSProperties = {
    maxWidth: 460, width: '100%', padding: 32,
    background: 'var(--bg-card, #16161e)',
    border: '1px solid var(--border, #2a2a3e)',
    borderRadius: 16, textAlign: 'center',
  }
  const headingStyle: React.CSSProperties = { fontSize: 24, marginBottom: 8, color: 'var(--text-primary, #fff)' }
  const subStyle: React.CSSProperties = { color: 'var(--text-secondary, #9494a0)', fontSize: 14, marginBottom: 16 }
  const orgBadgeStyle: React.CSSProperties = {
    display: 'inline-block', padding: '8px 16px',
    background: 'rgba(108, 92, 231, 0.12)',
    border: '1px solid rgba(108, 92, 231, 0.3)',
    borderRadius: 8, color: 'var(--accent, #6c5ce7)',
    fontWeight: 600, marginBottom: 16,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: 'var(--bg-elevated, #1e1e2e)',
    border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 14, color: 'var(--text-primary)',
    fontFamily: 'inherit', marginBottom: 16,
  }

  if (!orgWallet || !orgWalletPubkey) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>?</div>
          <h1 style={headingStyle}>Invalid invite link</h1>
          <p style={subStyle}>This invite is missing the employer wallet, or it's malformed.</p>
          <Link to="/" style={{ color: 'var(--accent, #6c5ce7)', fontSize: 14, textDecoration: 'underline' }}>
            Go to Zalary home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {step === 'invite' && (
          <>
            <h1 style={headingStyle}>You're invited</h1>
            <p style={subStyle}>You've been invited to join</p>
            <div style={orgBadgeStyle}>{decodeURIComponent(orgName)}</div>
            <p style={{ ...subStyle, marginBottom: 32 }}>on Zalary, paid privately in stablecoins.</p>

            {connected && publicKey ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Connected as <span className="mono" style={{ color: 'var(--accent)' }}>{truncatedAddress}</span>
                </p>
                <button
                  className="qa-btn primary-action"
                  onClick={() => setStep('awaiting-session')}
                  style={{ padding: '12px 28px', fontSize: 15, justifyContent: 'center', width: '100%', maxWidth: 280 }}
                >
                  Continue
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Connect your Solana wallet to get started
                </p>
                <WalletMultiButton />
              </div>
            )}
          </>
        )}

        {step === 'awaiting-session' && (
          <>
            {umbraStatus === 'session-underfunded' ? (
              <>
                <h1 style={headingStyle}>Top up your shielded session</h1>
                <p style={subStyle}>
                  Your private receiving key needs 0.05 SOL on devnet to pay for its own setup tx.
                  This is a one-time top-up from your main wallet. The session keypair stays in your browser.
                </p>
                {sessionPubkey && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, wordBreak: 'break-all' }}>
                    <span className="mono">{sessionPubkey}</span>
                  </p>
                )}
                {fundError && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{fundError}</p>}
                {umbraError && !fundError && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{umbraError}</p>}
                <button
                  className="qa-btn primary-action"
                  onClick={fundSession}
                  disabled={funding}
                  style={{ padding: '12px 28px', fontSize: 15, width: '100%' }}
                >
                  {funding ? 'Sending 0.05 SOL…' : 'Fund session with 0.05 SOL'}
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 24 }}>
                  <div style={{
                    width: 48, height: 48, margin: '0 auto',
                    border: '3px solid var(--border)',
                    borderTopColor: 'var(--accent, #6c5ce7)',
                    borderRadius: '50%', animation: 'join-spin 0.8s linear infinite',
                  }} />
                </div>
                <h1 style={headingStyle}>Generating your shielded session</h1>
                <p style={subStyle}>
                  Approve the signature in your wallet. We derive a private receiving key from it.
                  The chain never sees your main wallet receive payroll.
                </p>
                {umbraError && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{umbraError}</p>}
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Status: <span className="mono">{umbraStatus}</span>
                </p>
              </>
            )}
          </>
        )}

        {step === 'name' && (
          <>
            <h1 style={headingStyle}>Almost done</h1>
            <p style={subStyle}>
              Your employer will see this name in their payroll dashboard. Your wallet stays private.
            </p>
            <input
              style={inputStyle}
              placeholder="Your name"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              maxLength={40}
              autoFocus
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Sending: shielded pubkey <span className="mono">{truncatedSession}</span> · employer{' '}
              <span className="mono">{orgWalletPubkey.toBase58().slice(0, 6)}…{orgWalletPubkey.toBase58().slice(-4)}</span>
            </p>
            {errorMsg && <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>}
            <button
              className="qa-btn primary-action"
              onClick={handleConfirmJoin}
              disabled={!employeeName.trim()}
              style={{ padding: '12px 28px', fontSize: 15, width: '100%' }}
            >
              Join payroll
            </button>
          </>
        )}

        {step === 'processing' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{
                width: 48, height: 48, margin: '0 auto',
                border: '3px solid var(--border)',
                borderTopColor: 'var(--accent, #6c5ce7)',
                borderRadius: '50%', animation: 'join-spin 0.8s linear infinite',
              }} />
            </div>
            <h1 style={headingStyle}>Sending join announcement…</h1>
            <p style={subStyle}>A memo tx tells your employer's wallet that you're ready to receive payroll.</p>
          </>
        )}

        {step === 'success' && (
          <>
            <div style={{
              width: 64, height: 64, margin: '0 auto 20px',
              background: 'rgba(0,184,148,0.12)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success, #00b894)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h1 style={headingStyle}>You're on the payroll</h1>
            <p style={subStyle}>
              Your shielded pubkey is now visible to <strong style={{ color: 'var(--text-primary)' }}>{decodeURIComponent(orgName)}</strong>.
              Salary lands in your shielded inbox.
            </p>
            {txSignature && (
              <div style={{
                padding: '10px 16px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 8,
                marginBottom: 20, fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-muted)' }}>tx: </span>
                <a
                  href={`https://solscan.io/tx/${txSignature}?cluster=devnet`}
                  target="_blank" rel="noopener noreferrer"
                  className="mono"
                  style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                >
                  {txSignature.slice(0, 8)}...{txSignature.slice(-8)}
                </a>
              </div>
            )}
            <Link
              to="/employee"
              className="qa-btn primary-action"
              style={{
                display: 'inline-flex', padding: '12px 28px', fontSize: 15,
                justifyContent: 'center', textDecoration: 'none', width: '100%', maxWidth: 280,
              }}
            >
              Open my inbox
            </Link>
          </>
        )}

        {step === 'error' && (
          <>
            <div style={{
              width: 64, height: 64, margin: '0 auto 20px',
              background: 'rgba(255,107,107,0.12)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--error, #ff6b6b)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <h1 style={headingStyle}>That didn't go through</h1>
            <p style={{ ...subStyle, color: 'var(--error, #ff6b6b)' }}>{errorMsg || 'Transaction failed. Try again.'}</p>
            <button
              className="qa-btn primary-action"
              onClick={() => setStep('name')}
              style={{ padding: '12px 28px', fontSize: 15 }}
            >
              Try again
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes join-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
