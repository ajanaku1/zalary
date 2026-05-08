import { useState, useCallback, useEffect, useMemo } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { useIDKitRequest, IDKitRequestWidget } from '@worldcoin/idkit'
import { deviceLegacy } from '@worldcoin/idkit-core'
import type { IDKitResult } from '@worldcoin/idkit-core'
import TopNav from '../../components/TopNav'
import PrivyClaimCard from './PrivyClaimCard'
import { openMoonPaySell } from '../../lib/moonpay'
import { WORLD_ID_APP_ID, WORLD_ID_ACTION } from '../../lib/worldid'
import { useProgram } from '../../hooks/useProgram'
import { verifyWorldId as verifyWorldIdOnChain, findOrganizationPda, claimFunds as claimFundsOnChain } from '../../lib/program'

const USDC_MINT = new PublicKey('AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD')

export default function Portal() {
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [worldIdProof, setWorldIdProof] = useState<IDKitResult | null>(null)
  const [widgetOpen, setWidgetOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimTx, setClaimTx] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [usdcBalance, setUsdcBalance] = useState(0)
  const [usdcDisplayBalance, setUsdcDisplayBalance] = useState('--')
  const { publicKey, sendTransaction, connected, wallet, connect } = useWallet()
  const { connection } = useConnection()
  const { setVisible } = useWalletModal()
  const program = useProgram()

  const handleConnect = () => setVisible(true)

  // Auto-connect after wallet selection from modal
  useEffect(() => {
    if (wallet && !connected) {
      connect().catch(() => {})
    }
  }, [wallet, connected, connect])

  useEffect(() => {
    if (!publicKey || !connection) return
    const ata = getAssociatedTokenAddressSync(USDC_MINT, publicKey, false, TOKEN_2022_PROGRAM_ID)
    connection.getTokenAccountBalance(ata)
      .then(({ value }) => {
        setUsdcBalance(Number(value.amount) || 0)
        setUsdcDisplayBalance(value.uiAmountString || '0.00')
      })
      .catch(() => {
        setUsdcBalance(0)
        setUsdcDisplayBalance('0.00')
      })
  }, [publicKey, connection, claimTx])

  const idkitConfig = useMemo(() => {
    const ts = Math.floor(Date.now() / 1000)
    return {
      app_id: WORLD_ID_APP_ID as `app_${string}`,
      action: WORLD_ID_ACTION,
      allow_legacy_proofs: false,
      rp_context: {
        rp_id: WORLD_ID_APP_ID,
        nonce: crypto.randomUUID(),
        created_at: ts,
        expires_at: ts + 3600,
        signature: '',
      },
      preset: deviceLegacy({ signal: 'verify-employee' }),
    }
  }, [])
  const idkitRequest = useIDKitRequest(idkitConfig)

  const handleClaim = useCallback(async () => {
    if (!connected || !publicKey) {
      setClaimError('Connect your wallet first')
      return
    }
    if (usdcBalance <= 0) {
      setClaimError('No claimable balance')
      return
    }
    // Client-side World ID gate. The mainnet build moves this check into the
    // program itself (verify world_id_verified == true on the Employee PDA
    // inside claim_funds). Until then, enforce in the UI so the demo flow
    // matches the production behavior.
    if (!worldIdProof) {
      setClaimError('Verify with World ID before claiming')
      return
    }
    setClaiming(true)
    setClaimError(null)
    setClaimTx(null)
    try {
      const storedAuthority = localStorage.getItem('zalary_org_authority')
      if (!program) throw new Error('Wallet not connected to Solana program. Reconnect and retry.')
      if (!storedAuthority) {
        throw new Error('Organization not registered on this device. Ask your employer to share their org link, or connect from the same browser used during onboarding.')
      }
      const authorityPk = new PublicKey(storedAuthority)
      const [orgPda] = findOrganizationPda(authorityPk)
      const employeeAta = getAssociatedTokenAddressSync(USDC_MINT, publicKey, false, TOKEN_2022_PROGRAM_ID)
      const { tx } = await claimFundsOnChain(program, orgPda, employeeAta, employeeAta, USDC_MINT, usdcBalance)
      setClaimTx(tx)
      setUsdcBalance(0)
      setUsdcDisplayBalance('0.00')
    } catch (err: any) {
      console.error('Claim tx failed:', err)
      setClaimError(err?.message || 'Transaction failed')
    } finally {
      setClaiming(false)
    }
  }, [connected, publicKey, program, sendTransaction, connection, usdcBalance])

  const handleWorldIdSuccess = async (result: IDKitResult) => {
    setWorldIdProof(result)
    console.log('World ID verified:', result)

    // Write verification on-chain if program available
    if (program && publicKey) {
      try {
        // nullifier is in responses[0].nullifier (IDKit v4 field name)
        const nullifierHex = ((result.responses?.[0] as any)?.nullifier as string | undefined)?.replace('0x', '') || '0'.repeat(64)
        const nullifierBytes = Array.from(Buffer.from(nullifierHex.slice(0, 64).padEnd(64, '0'), 'hex'))
        const storedAuthority = localStorage.getItem('zalary_org_authority')
        const orgAuthority = storedAuthority ? new PublicKey(storedAuthority) : publicKey
        const [orgPda] = findOrganizationPda(orgAuthority)
        await verifyWorldIdOnChain(program, orgPda, nullifierBytes)
        console.log('World ID proof stored on-chain')
      } catch (err) {
        console.warn('On-chain World ID storage failed (expected if not employee of this org):', err)
      }
    }
  }

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
      <div style={{ padding: '0 20px' }}>
        <PrivyClaimCard />
      </div>
      {/* Authenticated header bar — sits inside <main> so it inherits the
          padding-top: 64px that clears the fixed TopNav. Previously rendered
          outside main and got buried under the nav, making Verify Identity
          unclickable. */}
      <div style={{ padding: '0 20px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {user?.email?.address || user?.google?.name || user?.twitter?.username || 'Logged in'}
            </span>
            <button
              onClick={logout}
              style={{
                background: 'transparent',
                border: '1px solid rgba(108,92,231,0.4)',
                color: '#6c5ce7',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </div>

          {worldIdProof ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,200,83,0.12)',
              color: '#00c853',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Verified
            </span>
          ) : (
            <>
              <button
                onClick={() => setWidgetOpen(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(108,92,231,0.4)',
                  color: '#6c5ce7',
                  padding: '8px 18px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Verify Identity
              </button>
              <IDKitRequestWidget
                {...idkitConfig}
                {...idkitRequest}
                open={widgetOpen}
                onOpenChange={setWidgetOpen}
                onSuccess={handleWorldIdSuccess}
              />
            </>
          )}
        </div>
      </div>

        <div className="employee-portal">
          {/* Balance Card */}
          <div className="balance-card-wrapper">
            <div className="balance-card-inner">
              <div className="balance-label">Available Balance</div>
              <div className="balance-amount mono">{claimTx ? '$0.00' : `$${usdcDisplayBalance}`}</div>
              <div className="balance-caption">
                {claimTx ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Claimed successfully
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Just for your eyes
                  </>
                )}
              </div>
              {claimError && (
                <div style={{ fontSize: 13, color: 'var(--error)', marginBottom: 8 }}>{claimError}</div>
              )}
              {claimTx && (
                <div style={{ marginBottom: 8 }}>
                  <a
                    href={`https://solscan.io/tx/${claimTx}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)', textDecoration: 'underline' }}
                  >
                    View on Solscan: {claimTx.slice(0, 8)}...{claimTx.slice(-8)}
                  </a>
                </div>
              )}
              <div className="balance-buttons">
                <button className="bal-btn claim" onClick={handleClaim} disabled={claiming || !!claimTx || !connected || usdcBalance <= 0}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                  {claiming ? 'Claiming...' : claimTx ? 'Claimed' : 'Claim'}
                </button>
                <button className="bal-btn cashout">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  Cash Out
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="quick-stats">
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div className="stat-label">Next Payment</div>
              <div className="stat-value mono">—</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </div>
              <div className="stat-label">This Month</div>
              <div className="stat-value mono">${usdcDisplayBalance}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div className="stat-label">Total Earned</div>
              <div className="stat-value mono">—</div>
            </div>
          </div>

          {/* Payment History */}
          <div className="payment-history">
            <h3>Payment History</h3>
            {claimTx ? (
              <div className="timeline">
                <div className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <span className="timeline-date">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="timeline-type">Claim</div>
                    <div className="timeline-bottom">
                      <span className="timeline-amount mono">${usdcDisplayBalance}</span>
                      <a className="timeline-tx" href={`https://solscan.io/tx/${claimTx}?cluster=devnet`} target="_blank" rel="noopener noreferrer">View Tx</a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '24px 16px', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                No payments yet. Claims and salary payments will appear here.
              </div>
            )}
          </div>

          {/* Cash Out */}
          <div className="cashout-section">
            <h3>Cash Out</h3>
            <p className="cashout-desc">Convert to local currency via MoonPay</p>
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
          <div style={{ padding: '0 20px', marginTop: 12 }}>
            <a href="/employee/income" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline' }}>
              View on-chain activity log
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
