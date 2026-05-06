import { useState, useCallback, useEffect, useRef } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { resolveSolDomain } from '../../lib/sns'
import { isValidSolanaAddress } from '../../lib/utils'
import { useProgram } from '../../hooks/useProgram'
import { createOrganization as createOrgOnChain, fundTreasury as fundTreasuryOnChain, findOrganizationPda } from '../../lib/program'

const USDC_MINT = new PublicKey('2Bis7EEvjTnQLwLnAtquKxS4y2uyzhbNuzoW6UEN68Gv')

interface OnboardingProps {
  onComplete: (data: {
    orgName: string
    employees: Array<{ name: string; wallet: string; salary: number }>
    treasuryAmount: number
    schedule: 'weekly' | 'biweekly' | 'monthly'
  }) => void
}

type ScheduleType = 'weekly' | 'biweekly' | 'monthly'

interface EmployeeEntry {
  name: string
  wallet: string
  salary: number
}

const TOTAL_STEPS = 6

function getNextPaymentDate(schedule: ScheduleType): string {
  const now = new Date()
  if (schedule === 'monthly') {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }
  // Find next Friday
  const day = now.getDay()
  const daysUntilFriday = (5 - day + 7) % 7 || 7
  const nextFriday = new Date(now)
  nextFriday.setDate(now.getDate() + daysUntilFriday)
  if (schedule === 'biweekly') {
    nextFriday.setDate(nextFriday.getDate() + 7)
  }
  return nextFriday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1)
  const [fadeClass, setFadeClass] = useState('onb-step-visible')

  // Step 2
  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)
  const [txSignature, setTxSignature] = useState<string | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)

  // Step 3
  const [employees, setEmployees] = useState<EmployeeEntry[]>([])
  const [walletInput, setWalletInput] = useState('')
  const [nickname, setNickname] = useState('')
  const [salaryInput, setSalaryInput] = useState('')
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 4
  const [treasuryAmount, setTreasuryAmount] = useState('')
  const [funded, setFunded] = useState(false)

  // Step 5
  const [schedule, setSchedule] = useState<ScheduleType>('biweekly')

  // Confetti for step 6
  const [confettiDots, setConfettiDots] = useState<Array<{ id: number; left: string; color: string; delay: string; duration: string; size: string }>>([])

  const program = useProgram()
  const { connection } = useConnection()

  const isSolDomain = walletInput.trim().endsWith('.sol')

  // Debounced SNS resolution
  useEffect(() => {
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current)
    setResolvedAddress(null)
    setResolveError(null)
    if (!isSolDomain || walletInput.trim().length < 5) return
    setResolving(true)
    resolveTimerRef.current = setTimeout(async () => {
      try {
        const address = await resolveSolDomain(walletInput.trim(), connection)
        if (address) {
          setResolvedAddress(address)
        } else {
          setResolveError('Could not resolve this .sol domain')
        }
      } catch {
        setResolveError('SNS lookup failed')
      } finally {
        setResolving(false)
      }
    }, 600)
    return () => { if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current) }
  }, [walletInput, isSolDomain, connection])

  const goToStep = useCallback((next: number) => {
    setFadeClass('onb-step-hidden')
    setTimeout(() => {
      setStep(next)
      setFadeClass('onb-step-visible')
    }, 200)
  }, [])

  const handleCreateOrg = useCallback(async () => {
    if (!orgName.trim()) return
    setCreating(true)
    setOrgError(null)
    setTxSignature(null)
    try {
      if (!program) {
        throw new Error('Wallet not connected to Solana program. Connect Phantom (or another Solana wallet that exposes signTransaction) and retry.')
      }
      const { tx } = await createOrgOnChain(program, orgName.trim(), USDC_MINT)
      setTxSignature(tx)
      setTimeout(() => goToStep(3), 800)
    } catch (err: any) {
      console.error('Create org failed:', err)
      setOrgError(err?.message ?? 'Transaction failed')
    } finally {
      setCreating(false)
    }
  }, [orgName, program, goToStep])

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
    const salary = parseFloat(salaryInput)
    if (!salaryInput || isNaN(salary) || salary <= 0) {
      setAddError('Enter a valid salary amount')
      return
    }
    const displayName = nickname.trim() || (isSolDomain ? walletInput.trim() : `${finalAddress.slice(0, 4)}...${finalAddress.slice(-4)}`)
    setEmployees(prev => [...prev, { name: displayName, wallet: finalAddress, salary }])
    setWalletInput('')
    setNickname('')
    setSalaryInput('')
    setResolvedAddress(null)
    setAddError(null)
  }, [walletInput, nickname, salaryInput, resolvedAddress, isSolDomain, isValidSolanaAddress])

  const [funding, setFunding] = useState(false)
  const [fundTx, setFundTx] = useState<string | null>(null)
  const [fundError, setFundError] = useState<string | null>(null)

  // Test-zUSDC faucet — devnet-only
  const [requestingFaucet, setRequestingFaucet] = useState(false)
  const [faucetSig, setFaucetSig] = useState<string | null>(null)
  const [faucetError, setFaucetError] = useState<string | null>(null)
  const [faucetReceived, setFaucetReceived] = useState(0)

  const handleRequestFaucet = useCallback(async () => {
    if (!program?.provider.publicKey) {
      setFaucetError('Connect your wallet first')
      return
    }
    setRequestingFaucet(true)
    setFaucetError(null)
    try {
      const wallet = program.provider.publicKey.toBase58()
      const res = await fetch(`/api/faucet?wallet=${wallet}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Faucet failed')
      setFaucetSig(data.sig)
      setFaucetReceived(prev => prev + (data.amount || 1000))
    } catch (err: any) {
      setFaucetError(err?.message || 'Faucet failed')
    } finally {
      setRequestingFaucet(false)
    }
  }, [program])

  const handleFund = useCallback(async () => {
    const amount = parseFloat(treasuryAmount)
    if (!amount || amount <= 0) return
    setFunding(true)
    setFundError(null)
    try {
      if (!program) {
        throw new Error('Wallet not connected to Solana program. Reconnect and retry.')
      }
      const authority = program.provider.publicKey!
      const [orgPda] = findOrganizationPda(authority)
      const signerAta = getAssociatedTokenAddressSync(USDC_MINT, authority)
      const { tx } = await fundTreasuryOnChain(
        program,
        orgPda,
        Math.round(amount * 1_000_000),
        signerAta,
        USDC_MINT,
      )
      setFundTx(tx)
      setFunded(true)
    } catch (err: any) {
      setFundError(err?.message || 'Transaction failed')
    } finally {
      setFunding(false)
    }
  }, [treasuryAmount, program])

  const spawnConfetti = useCallback(() => {
    const colors = ['#6c5ce7', '#e17055', '#00b894', '#fdcb6e', '#5a4bd1']
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const dots = Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: Math.random() * 100 + '%',
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 1.5 + 's',
      duration: (1.5 + Math.random() * 1.5) + 's',
      size: (4 + Math.random() * 4) + 'px',
    }))
    setConfettiDots(dots)
  }, [])

  const handleComplete = useCallback(() => {
    onComplete({
      orgName: orgName.trim(),
      employees,
      treasuryAmount: parseFloat(treasuryAmount) || 0,
      schedule,
    })
  }, [onComplete, orgName, employees, treasuryAmount, schedule])

  // Trigger confetti on step 6
  useEffect(() => {
    if (step === 6) spawnConfetti()
  }, [step, spawnConfetti])

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

  const primaryBtnStyle: React.CSSProperties = {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    padding: '14px 32px',
    borderRadius: 'var(--radius-full)',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    transition: 'background 0.2s, transform 0.1s',
  }

  const secondaryBtnStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    padding: '12px 24px',
    borderRadius: 'var(--radius-full)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'background 0.2s',
  }

  const backBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '8px 0',
    marginBottom: 8,
  }

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav className="top-nav">
        <div className="nav-logo">Z<span>.</span>alary</div>
      </nav>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 40px' }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 40, width: '100%', maxWidth: 320 }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i + 1 <= step ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        <div
          className={fadeClass}
          style={{
            width: '100%',
            maxWidth: 640,
            transition: 'opacity 0.2s ease',
            opacity: fadeClass === 'onb-step-visible' ? 1 : 0,
          }}
        >
          {/* ===================== STEP 1: Welcome ===================== */}
          {step === 1 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--accent-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 12 }}>
                Welcome to Zalary
              </h1>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 400, margin: '0 auto 40px' }}>
                Let's set up your organization in a few steps. You'll create your org, add team members, fund your treasury, and set a payment schedule.
              </p>
              <button onClick={() => goToStep(2)} style={primaryBtnStyle}>
                Get Started
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          )}

          {/* ===================== STEP 2: Create Organization ===================== */}
          {step === 2 && (
            <div>
              <button style={backBtnStyle} onClick={() => goToStep(1)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                Back
              </button>
              <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
                Name your organization
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                This will be visible to your team members and used throughout the dashboard.
              </p>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Organization Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  maxLength={64}
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  style={inputStyle}
                  autoFocus
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
                  {orgName.length}/64
                </div>
              </div>

              {txSignature && (
                <div style={{ padding: '12px 16px', background: 'rgba(0,184,148,0.12)', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                  Organization registered on-chain.{' '}
                  <a
                    href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                  >
                    View tx
                  </a>
                </div>
              )}

              {orgError && (
                <div style={{ fontSize: 13, color: 'var(--error)', marginBottom: 16 }}>
                  {orgError}
                </div>
              )}

              <button
                onClick={handleCreateOrg}
                disabled={creating || !orgName.trim()}
                style={{
                  ...primaryBtnStyle,
                  opacity: creating || !orgName.trim() ? 0.5 : 1,
                  cursor: creating || !orgName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? (
                  <>
                    <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'onb-spin 0.8s linear infinite' }} />
                    Creating...
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          )}

          {/* ===================== STEP 3: Add Employees ===================== */}
          {step === 3 && (
            <div>
              <button style={backBtnStyle} onClick={() => goToStep(2)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                Back
              </button>
              <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
                Add your first team members
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                Enter their Solana wallet address or .sol domain. You can always add more later.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Wallet Address or .sol Domain
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 7xKt...m4Fp or alice.sol"
                    value={walletInput}
                    onChange={e => setWalletInput(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {isSolDomain && resolving && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'onb-spin 0.8s linear infinite' }} />
                    Resolving {walletInput.trim()}...
                  </div>
                )}

                {resolvedAddress && (
                  <div style={{ padding: '10px 14px', background: 'rgba(0,184,148,0.08)', border: '1px solid rgba(0,184,148,0.2)', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>Resolved: </span>
                    <span className="mono" style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{resolvedAddress}</span>
                  </div>
                )}

                {resolveError && !resolving && (
                  <div style={{ fontSize: 13, color: 'var(--error)' }}>{resolveError}</div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Nickname <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alice"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Monthly Salary (USDC)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 8500"
                    min="0"
                    step="100"
                    value={salaryInput}
                    onChange={e => setSalaryInput(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {addError && (
                  <div style={{ fontSize: 13, color: 'var(--error)' }}>{addError}</div>
                )}

                <button
                  onClick={handleAddEmployee}
                  disabled={!walletInput.trim() || (isSolDomain && !resolvedAddress)}
                  style={{
                    ...secondaryBtnStyle,
                    opacity: !walletInput.trim() || (isSolDomain && !resolvedAddress) ? 0.5 : 1,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add Employee
                </button>
              </div>

              {/* Employee list */}
              {employees.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Added ({employees.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {employees.map((emp, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--accent-subtle)',
                            color: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                          }}>
                            {emp.name.split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2) || '??'}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {emp.wallet.length > 16 ? `${emp.wallet.slice(0, 4)}...${emp.wallet.slice(-4)}` : emp.wallet}
                              </span>
                              <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                                ${emp.salary.toLocaleString()}/mo
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setEmployees(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                          aria-label="Remove"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => goToStep(4)} style={primaryBtnStyle}>
                Continue
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              {employees.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                  You can skip this and add employees later
                </p>
              )}
            </div>
          )}

          {/* ===================== STEP 4: Fund Treasury ===================== */}
          {step === 4 && (
            <div>
              <button style={backBtnStyle} onClick={() => goToStep(3)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                Back
              </button>
              <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
                Fund your treasury
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                Deposit USDC to your organization's vault. This is where payroll funds are drawn from.
              </p>

              <div style={{
                padding: '14px 16px',
                background: 'rgba(108,92,231,0.06)',
                border: '1px dashed rgba(108,92,231,0.3)',
                borderRadius: 'var(--radius)',
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  No devnet zUSDC yet? Mint test tokens straight to your wallet — devnet only, 1000 zUSDC per click.
                </div>
                <button
                  onClick={handleRequestFaucet}
                  disabled={requestingFaucet || !program}
                  style={{
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: requestingFaucet || !program ? 'not-allowed' : 'pointer',
                    opacity: requestingFaucet || !program ? 0.5 : 1,
                  }}
                >
                  {requestingFaucet ? 'Minting…' : faucetReceived > 0 ? `Received ${faucetReceived} zUSDC — click for 1000 more` : 'Get 1000 test zUSDC'}
                </button>
                {faucetSig && (
                  <a
                    href={`https://solscan.io/tx/${faucetSig}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--accent)' }}
                  >
                    View mint tx: {faucetSig.slice(0, 8)}…{faucetSig.slice(-8)}
                  </a>
                )}
                {faucetError && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--error)' }}>{faucetError}</div>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Amount (USDC)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 14,
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                  }}>$</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    min="0"
                    value={treasuryAmount}
                    onChange={e => { setTreasuryAmount(e.target.value); setFunded(false) }}
                    disabled={funded}
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
              </div>

              {funded && (
                <div style={{
                  padding: '16px 20px',
                  background: 'rgba(0,184,148,0.08)',
                  border: '1px solid rgba(0,184,148,0.2)',
                  borderRadius: 'var(--radius)',
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--success)' }}>Treasury funded</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Balance</span>
                    <span className="mono" style={{ fontWeight: 600 }}>${parseFloat(treasuryAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC</span>
                  </div>
                </div>
              )}

              {fundError && (
                <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{fundError}</p>
              )}
              {fundTx && (
                <div style={{ fontSize: 13, marginBottom: 12 }}>
                  <a href={`https://solscan.io/tx/${fundTx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                    View tx: {fundTx.slice(0, 8)}...{fundTx.slice(-8)}
                  </a>
                </div>
              )}
              {!funded ? (
                <button
                  onClick={handleFund}
                  disabled={!treasuryAmount || parseFloat(treasuryAmount) <= 0 || funding}
                  style={{
                    ...primaryBtnStyle,
                    opacity: !treasuryAmount || parseFloat(treasuryAmount) <= 0 || funding ? 0.5 : 1,
                    cursor: !treasuryAmount || parseFloat(treasuryAmount) <= 0 || funding ? 'not-allowed' : 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                  {funding ? 'Signing...' : 'Fund Treasury'}
                </button>
              ) : (
                <button onClick={() => goToStep(5)} style={primaryBtnStyle}>
                  Continue
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              )}

              <button
                onClick={() => goToStep(5)}
                style={{
                  ...backBtnStyle,
                  justifyContent: 'center',
                  width: '100%',
                  marginTop: 12,
                  marginBottom: 0,
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ===================== STEP 5: Payment Schedule ===================== */}
          {step === 5 && (
            <div>
              <button style={backBtnStyle} onClick={() => goToStep(4)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                Back
              </button>
              <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
                Set up your payment structure
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
                Choose how often you want to run payroll for your team.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                {([
                  { value: 'weekly' as ScheduleType, label: 'Weekly', desc: 'Every Friday', icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  )},
                  { value: 'biweekly' as ScheduleType, label: 'Bi-weekly', desc: 'Every other Friday', icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>
                  )},
                  { value: 'monthly' as ScheduleType, label: 'Monthly', desc: '1st of each month', icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  )},
                ]).map(opt => {
                  const selected = schedule === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSchedule(opt.value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '20px',
                        background: selected ? 'var(--accent-subtle)' : 'var(--bg-card)',
                        border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: selected ? 'var(--accent)' : 'var(--bg-elevated)',
                        color: selected ? '#fff' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.2s',
                      }}>
                        {opt.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{opt.desc}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Next payment</div>
                        <div className="mono" style={{ fontSize: 13, color: selected ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {getNextPaymentDate(opt.value)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <button onClick={() => goToStep(6)} style={primaryBtnStyle}>
                Complete Setup
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
            </div>
          )}

          {/* ===================== STEP 6: Done ===================== */}
          {step === 6 && (
            <div style={{ textAlign: 'center', position: 'relative' }}>
              {/* Confetti */}
              {confettiDots.length > 0 && (
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                  {confettiDots.map(dot => (
                    <div
                      key={dot.id}
                      style={{
                        position: 'absolute',
                        top: -10,
                        left: dot.left,
                        width: dot.size,
                        height: dot.size,
                        borderRadius: '50%',
                        background: dot.color,
                        animation: `onb-confetti-fall ${dot.duration} ${dot.delay} ease-in forwards`,
                        opacity: 0.8,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Success icon */}
              <div style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(0,184,148,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                animation: 'onb-scale-in 0.5s var(--ease)',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>

              <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
                Your organization is ready
              </h2>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32 }}>
                Everything is set up. You're ready to manage payroll on Solana.
              </p>

              {/* Summary card */}
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                marginBottom: 32,
                textAlign: 'left',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
                  Setup Summary
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Organization</span>
                    <span style={{ fontWeight: 600 }}>{orgName.trim()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Team Members</span>
                    <span className="mono">{employees.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Treasury</span>
                    <span className="mono">
                      {funded && treasuryAmount ? `$${parseFloat(treasuryAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC` : 'Not funded yet'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Schedule</span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {schedule === 'biweekly' ? 'Bi-weekly' : schedule}
                    </span>
                  </div>
                </div>
              </div>

              <button onClick={handleComplete} style={primaryBtnStyle}>
                Go to Dashboard
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Inline keyframe animations */}
      <style>{`
        @keyframes onb-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes onb-confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
          100% { transform: translateY(500px) rotate(720deg); opacity: 0; }
        }
        @keyframes onb-scale-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
