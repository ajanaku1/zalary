import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { usePrivy } from '@privy-io/react-auth'
import { useRole } from '../contexts/RoleContext'
import { truncateAddress } from '../lib/utils'

type TopNavVariant = 'landing' | 'employer' | 'employee'
export type EmployerTab = 'dashboard' | 'team' | 'payroll' | 'treasury' | 'insights'

interface TopNavProps {
  variant: TopNavVariant
  activeTab?: EmployerTab
  onTabChange?: (tab: EmployerTab) => void
  orgName?: string
}

const ROLE_STYLES: Record<string, { background: string; color: string }> = {
  owner: { background: 'var(--accent-subtle)', color: 'var(--accent)' },
  admin: { background: 'var(--accent-warm-subtle)', color: 'var(--accent-warm)' },
  viewer: { background: 'rgba(0,184,148,0.12)', color: 'var(--success)' },
}

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_STYLES[role] ?? ROLE_STYLES.viewer
  return (
    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 600, textTransform: 'capitalize', ...style }}>
      {role}
    </span>
  )
}

export default function TopNav({ variant, activeTab = 'dashboard', onTabChange, orgName }: TopNavProps) {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { publicKey, connected, disconnect, wallet, connect } = useWallet()
  const { connection } = useConnection()
  const { setVisible } = useWalletModal()
  const [solBalance, setSolBalance] = useState<number | null>(null)
  const { authenticated, user } = usePrivy()
  const { role } = useRole()

  // Derive initials from Privy user for the avatar
  const privyDisplayName = authenticated && user
    ? user.email?.address || user.google?.name || user.twitter?.username || null
    : null
  const avatarInitials = privyDisplayName
    ? privyDisplayName.slice(0, 2).toUpperCase()
    : 'AJ'

  const handleConnect = () => setVisible(true)

  // When user picks a wallet from the modal, it sets `wallet` but doesn't auto-connect.
  // Watch for wallet selection and trigger connect().
  useEffect(() => {
    if (wallet && !connected) {
      connect().catch(() => {
        // User rejected or wallet errored — that's fine
      })
    }
  }, [wallet, connected, connect])

  useEffect(() => {
    if (!connected || !publicKey) {
      setSolBalance(null)
      return
    }
    let cancelled = false
    connection.getBalance(publicKey).then((lamports) => {
      if (!cancelled) setSolBalance(lamports / LAMPORTS_PER_SOL)
    }).catch(() => {
      if (!cancelled) setSolBalance(null)
    })
    return () => { cancelled = true }
  }, [connected, publicKey, connection])

  const goTo = (path: string) => {
    setMobileMenuOpen(false)
    window.scrollTo(0, 0)
    navigate(path)
  }

  if (variant === 'landing') {
    return (
      <nav className="top-nav">
        <div className="nav-logo">Z<span>.</span>alary</div>
        <div className="nav-links" style={mobileMenuOpen ? { display: 'flex' } : undefined}>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#security">Security</a>
        </div>
        <div className="nav-right">
          <button className="btn-launch" onClick={() => goTo('/employer')}>Launch App</button>
          <button className="hamburger" onClick={() => setMobileMenuOpen(v => !v)} aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>
    )
  }

  if (variant === 'employer') {
    return (
      <nav className="top-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="nav-logo" style={{ cursor: 'pointer' }} onClick={() => goTo('/')}>Z<span>.</span>alary</div>
          <div className="org-dropdown">
            {orgName || 'My Organization'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        <div className="nav-tabs" style={{ display: typeof window !== 'undefined' && window.innerWidth > 900 ? 'flex' : 'none' }}>
          {(['dashboard', 'team', 'payroll', 'treasury', 'insights'] as const).map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => onTabChange?.(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="nav-right">
          {connected && publicKey ? (
            <div className="wallet-pill" onClick={disconnect} style={{ cursor: 'pointer' }} title="Click to disconnect">
              <div className="dot"></div>
              <span className="addr mono">{truncateAddress(publicKey.toBase58())}</span>
              <span className="bal mono">{solBalance !== null ? `${solBalance.toFixed(2)} SOL` : '-- SOL'}</span>
            </div>
          ) : (
            <button className="wallet-pill" onClick={handleConnect} style={{ cursor: 'pointer' }}>
              <span className="addr mono">Connect Wallet</span>
            </button>
          )}
          {role && <RoleBadge role={role} />}
          <div className="avatar-sm">AJ</div>
        </div>
      </nav>
    )
  }

  // variant === 'employee'
  return (
    <nav className="top-nav">
      <div className="nav-logo" style={{ cursor: 'pointer' }} onClick={() => goTo('/')}>Z<span>.</span>alary</div>
      <div className="nav-right">
        {connected && publicKey ? (
          <div className="wallet-pill" onClick={disconnect} style={{ cursor: 'pointer' }} title="Click to disconnect">
            <div className="dot"></div>
            <span className="addr mono">{truncateAddress(publicKey.toBase58())}</span>
            <span className="bal mono">{solBalance !== null ? `${solBalance.toFixed(2)} SOL` : '-- SOL'}</span>
          </div>
        ) : (
          <button className="wallet-pill" onClick={handleConnect} style={{ cursor: 'pointer' }}>
            <span className="addr mono">Connect Wallet</span>
          </button>
        )}
        <div className="avatar-sm" title={privyDisplayName || 'Account'}>{avatarInitials}</div>
      </div>
    </nav>
  )
}
