import { useState, useCallback, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { PublicKey } from '@solana/web3.js'
import TopNav from '../../components/TopNav'
import ShieldedInbox from '../../components/ShieldedInbox'
import { openMoonPaySell } from '../../lib/moonpay'
import { verifyWithWorldId, type WorldIdProof } from '../../lib/worldid'
import { useProgram } from '../../hooks/useProgram'
import { verifyWorldId as verifyWorldIdOnChain, findOrganizationPda } from '../../lib/program'

export default function Portal() {
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [worldIdProof, setWorldIdProof] = useState<WorldIdProof | null>(null)
  const [verifying, setVerifying] = useState(false)
  const { publicKey, connected, wallet, connect } = useWallet()
  const { setVisible } = useWalletModal()
  const program = useProgram()

  const handleConnect = () => setVisible(true)

  useEffect(() => {
    if (wallet && !connected) {
      connect().catch(() => {})
    }
  }, [wallet, connected, connect])

  // World ID verification — devnet demo path uses the mock helper from
  // lib/worldid.ts. The on-chain `verify_world_id` instruction stores a
  // nullifier on the Employee PDA so the same human can't double-claim
  // shielded payroll. Mainnet swaps the mock for the real IDKit widget.
  const handleVerifyDemo = useCallback(async () => {
    setVerifying(true)
    try {
      const proof = await verifyWithWorldId()
      if (!proof) return
      setWorldIdProof(proof)
      if (program && publicKey) {
        try {
          const nullifierHex = proof.nullifier_hash.replace('0x', '').slice(0, 64).padEnd(64, '0')
          const nullifierBytes = Array.from(Buffer.from(nullifierHex, 'hex'))
          const storedAuthority = localStorage.getItem('zalary_org_authority')
          const orgAuthority = storedAuthority ? new PublicKey(storedAuthority) : publicKey
          const [orgPda] = findOrganizationPda(orgAuthority)
          await verifyWorldIdOnChain(program, orgPda, nullifierBytes)
        } catch (err) {
          console.warn('On-chain World ID storage failed (expected if not employee of this org):', err)
        }
      }
    } finally {
      setVerifying(false)
    }
  }, [program, publicKey])

  // Gate: show login screen if neither Privy authenticated nor wallet connected
  const isLoggedIn = (ready && authenticated) || connected
  if (!isLoggedIn) {
    return (
      <div className="screen active">
        <nav className="top-nav">
          <div className="nav-logo">Z<span>.</span>alary</div>
        </nav>
        <main>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', padding: 24, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.5px' }}>Employee Portal</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 360, lineHeight: 1.6 }}>
              Sign in to view your salary, claim funds, and manage your payroll.
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M22 10H2"/></svg>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Sign In with Email
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
              Connect your Solana wallet or sign in via Privy
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="screen active">
      <TopNav variant="employee" />

      <main>
      {/* Account header — pinned to the top-left under the nav logo, with
          breathing room from the fixed top-nav. */}
      <div style={{ padding: '24px 20px 0', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {user?.email?.address || user?.google?.name || user?.twitter?.username || 'Logged in'}
          </span>
          <button
            onClick={logout}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
          {worldIdProof ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(46,213,115,0.12)',
              color: '#2ed573',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              fontWeight: 600,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Verified
            </span>
          ) : (
            <button
              onClick={handleVerifyDemo}
              disabled={verifying}
              style={{
                background: 'transparent',
                border: '1px solid var(--accent-subtle)',
                color: 'var(--accent)',
                padding: '6px 14px',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                fontWeight: 600,
                cursor: verifying ? 'wait' : 'pointer',
                opacity: verifying ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              title="Devnet demo: synthesizes a device-level proof and writes a nullifier to your Employee PDA. Mainnet migration replaces this with the real IDKit flow."
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              {verifying ? 'Verifying…' : 'Verify Identity (demo)'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 20px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
        <ShieldedInbox />
      </div>

        {/* Cash Out — outer wrapper matches the inbox's 760px column +
            20px gutter. Inner div keeps the native .cashout-section padding
            so it visually rhymes with the inbox card. */}
        <div style={{ padding: '0 20px', maxWidth: 760, margin: '48px auto 0', width: '100%' }}>
          <div className="cashout-section">
            <h3>Cash Out</h3>
            <p className="cashout-desc">After unshielding, convert your public dUSDC to local currency via MoonPay.</p>
            <div className="currency-chips">
              {['USD', 'EUR', 'NGN', 'INR', 'BRL'].map((currency) => (
                <button
                  key={currency}
                  className={`currency-chip ${selectedCurrency === currency ? 'selected' : ''}`}
                  onClick={() => setSelectedCurrency(currency)}
                >
                  {currency}
                </button>
              ))}
            </div>
            <button className="btn-moonpay" onClick={() => openMoonPaySell(selectedCurrency.toLowerCase())}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open MoonPay
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
