import { useState, useCallback, useEffect, useRef } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { resolveSolDomain } from '../../lib/sns'
import { isValidSolanaAddress } from '../../lib/utils'

interface AddEmployeeProps {
  open: boolean
  onClose: () => void
  onEmployeeAdded: (employee: { name: string; wallet: string }) => void
}

type Tab = 'direct' | 'invite'

export default function AddEmployee({ open, onClose, onEmployeeAdded }: AddEmployeeProps) {
  const [activeTab, setActiveTab] = useState<Tab>('direct')
  const [walletInput, setWalletInput] = useState('')
  const [nickname, setNickname] = useState('')
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { connection } = useConnection()

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      setActiveTab('direct')
      setWalletInput('')
      setNickname('')
      setResolvedAddress(null)
      setResolving(false)
      setResolveError(null)
      setAddError(null)
      setInviteLink(null)
      setCopied(false)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }, [open])

  const isSolDomain = walletInput.trim().endsWith('.sol')

  // Debounced SNS resolution
  useEffect(() => {
    if (resolveTimerRef.current) {
      clearTimeout(resolveTimerRef.current)
    }
    setResolvedAddress(null)
    setResolveError(null)

    if (!isSolDomain || walletInput.trim().length < 5) return

    setResolving(true)
    resolveTimerRef.current = setTimeout(async () => {
      try {
        const address = await resolveSolDomain(walletInput.trim(), connection)
        if (address) {
          setResolvedAddress(address)
          setResolveError(null)
        } else {
          setResolveError('Could not resolve this .sol domain')
        }
      } catch {
        setResolveError('SNS lookup failed')
      } finally {
        setResolving(false)
      }
    }, 600)

    return () => {
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current)
    }
  }, [walletInput, isSolDomain, connection])

  const handleAddEmployee = useCallback(() => {
    setAddError(null)
    const finalAddress = isSolDomain ? resolvedAddress : walletInput.trim()

    if (!finalAddress) {
      setAddError(isSolDomain ? 'Waiting for .sol domain to resolve' : 'Enter a wallet address')
      return
    }

    if (!isValidSolanaAddress(finalAddress)) {
      setAddError('Invalid Solana wallet address')
      return
    }

    const displayName = nickname.trim() || (isSolDomain ? walletInput.trim() : `${finalAddress.slice(0, 4)}...${finalAddress.slice(-4)}`)

    onEmployeeAdded({ name: displayName, wallet: finalAddress })
    // Reset form
    setWalletInput('')
    setNickname('')
    setResolvedAddress(null)
    setResolveError(null)
    setAddError(null)
  }, [walletInput, nickname, resolvedAddress, isSolDomain, isValidSolanaAddress, onEmployeeAdded])

  const generateInviteLink = useCallback(() => {
    const refId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    const orgName = 'AcmeCorp' // In production, this comes from the org state
    const link = `${window.location.origin}/join?org=${encodeURIComponent(orgName)}&ref=${refId}`
    setInviteLink(link)
    setCopied(false)
  }, [])

  const copyLink = useCallback(async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = inviteLink
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [inviteLink])

  const closePanel = useCallback(() => {
    onClose()
    setTimeout(() => {
      setWalletInput('')
      setNickname('')
      setResolvedAddress(null)
      setResolving(false)
      setResolveError(null)
      setAddError(null)
      setInviteLink(null)
      setCopied(false)
    }, 280)
  }, [onClose])

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    flex: 1,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    borderRadius: 8,
    transition: 'all 0.2s',
    background: activeTab === tab ? 'var(--bg-elevated)' : 'transparent',
    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
  })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    fontSize: 14,
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={closePanel}></div>
      <div className={`slide-panel ${open ? 'open' : ''}`}>
        <div className="panel-header">
          <h2>Add Employee</h2>
          <button className="panel-close" onClick={closePanel} aria-label="Close panel">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="panel-body">
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-surface)', borderRadius: 10, marginBottom: 24, border: '1px solid var(--border)' }}>
            <button style={tabStyle('direct')} onClick={() => setActiveTab('direct')}>
              Direct
            </button>
            <button style={tabStyle('invite')} onClick={() => setActiveTab('invite')}>
              Invite Link
            </button>
          </div>

          {/* Direct Add Tab */}
          {activeTab === 'direct' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Wallet Address or .sol Domain
                </label>
                <input
                  type="text"
                  placeholder="e.g. 7xKt...m4Fp or alice.sol"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Resolving indicator */}
              {isSolDomain && resolving && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></span>
                  Resolving {walletInput.trim()}...
                </div>
              )}

              {/* Resolved address */}
              {resolvedAddress && (
                <div style={{ padding: '10px 14px', background: 'rgba(0,184,148,0.08)', border: '1px solid rgba(0,184,148,0.2)', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--success)', fontWeight: 500 }}>Resolved: </span>
                  <span className="mono" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{resolvedAddress}</span>
                </div>
              )}

              {/* Resolve error */}
              {resolveError && !resolving && (
                <div style={{ fontSize: 13, color: 'var(--error)' }}>
                  {resolveError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Nickname <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alice"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {addError && (
                <div style={{ fontSize: 13, color: 'var(--error)' }}>
                  {addError}
                </div>
              )}

              <button
                className="qa-btn primary-action"
                onClick={handleAddEmployee}
                disabled={!walletInput.trim() || (isSolDomain && !resolvedAddress)}
                style={{ width: '100%', justifyContent: 'center', padding: '12px 20px', marginTop: 8 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                Add Employee
              </button>
            </div>
          )}

          {/* Invite Link Tab */}
          {activeTab === 'invite' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Generate a unique invite link. The employee opens it, connects their wallet, and joins your organization.
              </p>

              {!inviteLink ? (
                <button
                  className="qa-btn primary-action"
                  onClick={generateInviteLink}
                  style={{ width: '100%', justifyContent: 'center', padding: '14px 20px' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                  Generate Invite Link
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Link display */}
                  <div style={{
                    padding: '12px 16px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                  }}>
                    {inviteLink}
                  </div>

                  {/* Copy button */}
                  <button
                    className="qa-btn primary-action"
                    onClick={copyLink}
                    style={{ width: '100%', justifyContent: 'center', padding: '12px 20px' }}
                  >
                    {copied ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        Copy Link
                      </>
                    )}
                  </button>

                  {/* Share row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Share via</span>
                    <button
                      onClick={copyLink}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)', cursor: 'pointer', color: 'var(--text-secondary)',
                      }}
                      aria-label="Copy to clipboard"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                  </div>

                  {/* QR placeholder */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 140, border: '2px dashed var(--border)', borderRadius: 12,
                    color: 'var(--text-muted)', fontSize: 13, flexDirection: 'column', gap: 8,
                  }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>
                    QR Code
                  </div>

                  {/* Generate new link */}
                  <button
                    className="qa-btn secondary-action"
                    onClick={generateInviteLink}
                    style={{ width: '100%', justifyContent: 'center', padding: '10px 20px' }}
                  >
                    Generate New Link
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spin animation for the resolving spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
