import { useState, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Transaction, SystemProgram } from '@solana/web3.js'
import { pollConfirm } from '../../lib/program'

type JoinStep = 'invite' | 'confirm' | 'processing' | 'success' | 'error'

export default function JoinOrg() {
  const [searchParams] = useSearchParams()
  const orgName = searchParams.get('org') || 'Unknown Organization'
  const refCode = searchParams.get('ref')
  const [step, setStep] = useState<JoinStep>('invite')
  const [txSignature, setTxSignature] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { publicKey, sendTransaction, connected } = useWallet()
  const { connection } = useConnection()

  const truncatedAddress = useMemo(() => {
    if (!publicKey) return ''
    const addr = publicKey.toBase58()
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }, [publicKey])

  const handleConfirmJoin = useCallback(async () => {
    if (!publicKey) return
    setStep('processing')
    setErrorMsg(null)

    try {
      // Send a self-transfer memo transaction as proof of wallet ownership
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey, // self-transfer (0 SOL)
          lamports: 0,
        })
      )
      const sig = await sendTransaction(tx, connection)
      await pollConfirm(connection, sig)
      setTxSignature(sig)
      setStep('success')
    } catch (err: unknown) {
      console.error('Join transaction failed:', err)
      const message = err instanceof Error ? err.message : 'Transaction failed'
      setErrorMsg(message)
      setStep('error')
    }
  }, [publicKey, sendTransaction, connection])

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg, #0a0a0f)',
  }

  const cardStyle: React.CSSProperties = {
    maxWidth: 460,
    width: '100%',
    padding: 32,
    background: 'var(--bg-card, #16161e)',
    border: '1px solid var(--border, #2a2a3e)',
    borderRadius: 16,
    textAlign: 'center',
  }

  const headingStyle: React.CSSProperties = {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 8,
    color: 'var(--text-primary, #fff)',
  }

  const subStyle: React.CSSProperties = {
    fontSize: 14,
    color: 'var(--text-secondary, #8a8a9a)',
    marginBottom: 28,
    lineHeight: 1.5,
  }

  const orgBadgeStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '6px 16px',
    background: 'var(--accent-subtle, rgba(108,92,231,0.12))',
    color: 'var(--accent, #6c5ce7)',
    borderRadius: 20,
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 20,
  }

  if (!refCode) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>?</div>
          <h1 style={headingStyle}>Invalid Invite Link</h1>
          <p style={subStyle}>This invite link is missing required parameters.</p>
          <Link to="/" style={{ color: 'var(--accent, #6c5ce7)', fontSize: 14, textDecoration: 'underline' }}>
            Go to Zalary Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Step: Invite / Connect Wallet */}
        {step === 'invite' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #6c5ce7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <h1 style={headingStyle}>You're Invited!</h1>
            <p style={subStyle}>You've been invited to join</p>
            <div style={orgBadgeStyle}>{decodeURIComponent(orgName)}</div>
            <p style={{ ...subStyle, marginBottom: 32 }}>on Zalary</p>

            {connected && publicKey ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Connected as <span className="mono" style={{ color: 'var(--accent)' }}>{truncatedAddress}</span>
                </p>
                <button
                  className="qa-btn primary-action"
                  onClick={() => setStep('confirm')}
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

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #6c5ce7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h1 style={headingStyle}>Confirm & Join</h1>
            <p style={subStyle}>
              You're joining <strong style={{ color: 'var(--text-primary)' }}>{decodeURIComponent(orgName)}</strong> as
            </p>
            <div style={{
              padding: '12px 20px',
              background: 'var(--bg-elevated, #1e1e2e)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              marginBottom: 24,
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: 'var(--text-secondary)',
              wordBreak: 'break-all',
            }}>
              {publicKey?.toBase58()}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
              A zero-cost transaction will be sent to verify your wallet ownership.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                className="qa-btn secondary-action"
                onClick={() => setStep('invite')}
                style={{ padding: '12px 24px' }}
              >
                Back
              </button>
              <button
                className="qa-btn primary-action"
                onClick={handleConfirmJoin}
                style={{ padding: '12px 28px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Confirm & Join
              </button>
            </div>
          </>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{
                width: 48, height: 48, margin: '0 auto',
                border: '3px solid var(--border)',
                borderTopColor: 'var(--accent, #6c5ce7)',
                borderRadius: '50%',
                animation: 'join-spin 0.8s linear infinite',
              }}></div>
            </div>
            <h1 style={headingStyle}>Joining...</h1>
            <p style={subStyle}>Signing wallet verification transaction</p>
          </>
        )}

        {/* Step: Success */}
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
            <h1 style={headingStyle}>Welcome!</h1>
            <p style={subStyle}>
              You've successfully joined <strong style={{ color: 'var(--text-primary)' }}>{decodeURIComponent(orgName)}</strong>
            </p>
            {txSignature && (
              <div style={{
                padding: '10px 16px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-muted)' }}>tx: </span>
                <a
                  href={`https://solscan.io/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
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
              Go to Employee Portal
            </Link>
          </>
        )}

        {/* Step: Error */}
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
            <h1 style={headingStyle}>Something Went Wrong</h1>
            <p style={{ ...subStyle, color: 'var(--error, #ff6b6b)' }}>
              {errorMsg || 'Transaction failed. Please try again.'}
            </p>
            <button
              className="qa-btn primary-action"
              onClick={() => setStep('confirm')}
              style={{ padding: '12px 28px', fontSize: 15 }}
            >
              Try Again
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes join-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
