import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { usePrivy } from '@privy-io/react-auth'
import Logo from '../../components/Logo'

interface AuthGateProps {
  onAuth: () => void
}

export default function AuthGate({ onAuth: _onAuth }: AuthGateProps) {
  const [mode, setMode] = useState<'signin' | 'create'>('signin')
  const { connected, wallet, connect } = useWallet()
  const { setVisible } = useWalletModal()
  const { ready, login } = usePrivy()

  const handleConnect = () => setVisible(true)

  // Auto-connect after wallet selection from modal
  useEffect(() => {
    if (wallet && !connected) {
      connect().catch((err) => {
        console.error('[AuthGate] Auto-connect failed:', err)
      })
    }
  }, [wallet, connected, connect])

  return (
    <div className="screen active">
      <nav className="top-nav">
        <Logo className="nav-logo" size={28} />
      </nav>
      <main>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 64px)',
          padding: 24,
          textAlign: 'center',
        }}>
          {/* Icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--accent-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.5px' }}>
            {mode === 'signin' ? 'Welcome Back' : 'Create Your Account'}
          </h2>
          <p style={{
            fontSize: 15,
            color: 'var(--text-secondary)',
            marginBottom: 32,
            maxWidth: 360,
            lineHeight: 1.6,
          }}>
            {mode === 'signin'
              ? 'Sign in to manage your organization, run payroll, and track your treasury.'
              : 'Set up your employer account to start managing payroll on Solana.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
            <button
              onClick={handleConnect}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                padding: '14px 28px',
                borderRadius: 'var(--radius-full)',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M22 10H2" />
              </svg>
              Connect Wallet
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <button
              onClick={login}
              disabled={!ready}
              style={{
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                padding: '14px 28px',
                borderRadius: 'var(--radius-full)',
                fontSize: 15,
                fontWeight: 600,
                cursor: ready ? 'pointer' : 'not-allowed',
                opacity: ready ? 1 : 0.5,
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Sign In with Email
            </button>
          </div>

          {/* Toggle between sign in and create */}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 24 }}>
            {mode === 'signin' ? (
              <>
                New to Zalary?{' '}
                <button
                  onClick={() => setMode('create')}
                  style={{
                    color: 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: 'underline',
                    textUnderlineOffset: 2,
                  }}
                >
                  Create Account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => setMode('signin')}
                  style={{
                    color: 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: 'underline',
                    textUnderlineOffset: 2,
                  }}
                >
                  Sign In
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}
