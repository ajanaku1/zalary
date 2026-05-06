import { useState, useEffect, useRef, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { useProgram } from '../../hooks/useProgram'
import { findOrganizationPda, runPayroll as runPayrollOnChain } from '../../lib/program'

const USDC_MINT = new PublicKey('2Bis7EEvjTnQLwLnAtquKxS4y2uyzhbNuzoW6UEN68Gv')

interface PayrollEmployee {
  initials: string
  name: string
  wallet: string       // truncated display
  walletFull?: string  // full base58 address for on-chain calls
  bg: string
  color: string
}

interface PayrollPanelProps {
  open: boolean
  onClose: () => void
  employees?: (PayrollEmployee & { salary?: number })[]
  onPayrollComplete?: (totalPaid: number, txSignature: string) => void
}

export default function PayrollPanel({ open, onClose, employees = [], onPayrollComplete }: PayrollPanelProps) {
  const [payrollStep, setPayrollStep] = useState(1)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [phaseStates, setPhaseStates] = useState<Array<'idle' | 'active' | 'done'>>(['idle', 'idle', 'idle'])
  const [confettiDots, setConfettiDots] = useState<Array<{ id: number; left: string; color: string; delay: string; duration: string; size: string }>>([])
  const [txSignature, setTxSignature] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [txConfirmed, setTxConfirmed] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const program = useProgram()

  const spawnConfetti = useCallback(() => {
    const colors = ['#6c5ce7', '#e17055', '#00b894', '#fdcb6e', '#5a4bd1']
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const dots = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100 + '%',
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 1.5 + 's',
      duration: (1.5 + Math.random() * 1.5) + 's',
      size: (4 + Math.random() * 4) + 'px',
    }))
    setConfettiDots(dots)
  }, [])

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      setPayrollStep(1)
      setConfirmChecked(false)
      setPhaseStates(['idle', 'idle', 'idle'])
      setConfettiDots([])
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }, [open])

  // When payrollStep changes to 3, start animation but DON'T auto-advance to 4
  // Only go to step 4 when txConfirmed becomes true
  useEffect(() => {
    if (payrollStep === 3) {
      // Show phases animating but don't auto-advance
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const delay = reduced ? 50 : 800
      const t1 = setTimeout(() => setPhaseStates(['active', 'idle', 'idle']), 200)
      const t2 = setTimeout(() => setPhaseStates(['done', 'active', 'idle']), delay + 200)
      timersRef.current = [t1, t2]
      // Phase 3 stays active until txConfirmed
    }
    if (payrollStep === 4) {
      spawnConfetti()
    }
  }, [payrollStep, spawnConfetti])

  // When tx is confirmed, finish the animation and go to success
  useEffect(() => {
    if (txConfirmed && payrollStep === 3) {
      setPhaseStates(['done', 'done', 'active'])
      const t = setTimeout(() => {
        setPhaseStates(['done', 'done', 'done'])
        setTimeout(() => setPayrollStep(4), 400)
      }, 600)
      timersRef.current.push(t)
    }
  }, [txConfirmed, payrollStep])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
    }
  }, [])

  const advancePayroll = useCallback(async () => {
    if (payrollStep === 2 && !confirmChecked) return

    if (payrollStep === 2) {
      if (!publicKey) {
        setTxError('Connect your wallet first')
        return
      }
      setTxError(null)
      setSigning(true)

      try {
        let lastSig = ''
        const payableEmployees = employees.filter(
          (e): e is typeof e & { walletFull: string; salary: number } =>
            !!e.walletFull && !!e.salary && e.salary > 0
        )

        if (!program) {
          throw new Error('Wallet not connected to Solana program. Reconnect and retry.')
        }
        if (payableEmployees.length === 0) {
          throw new Error(
            `No payable employees. ${employees.length} employee(s) loaded but none have both an on-chain wallet and a salary > 0. Open each employee in the dashboard, set a salary, and click "Encrypt & Save" so the salary lands on-chain.`
          )
        }

        const [orgPda] = findOrganizationPda(publicKey)
        const orgAccount = await (program.account as any).organization.fetchNullable(orgPda)
        if (!orgAccount) throw new Error('Organization not found on-chain. Complete the onboarding flow first.')

        let payrollCount = Number(orgAccount.payrollCount)
        for (const emp of payableEmployees) {
          const employeeWalletPk = new PublicKey(emp.walletFull)
          const employeeAta = getAssociatedTokenAddressSync(USDC_MINT, employeeWalletPk)
          const { tx } = await runPayrollOnChain(
            program,
            orgPda,
            employeeWalletPk,
            employeeAta,
            USDC_MINT,
            Math.round(emp.salary * 1_000_000),
            payrollCount,
          )
          lastSig = tx
          payrollCount++
        }

        setSigning(false)
        setPayrollStep(3)
        setTxSignature(lastSig)
        // Delay txConfirmed so step 3 animation has one frame to render before completing
        setTimeout(() => setTxConfirmed(true), 50)
        const totalPaid = employees.reduce((sum, e) => sum + (e.salary || 0), 0)
        onPayrollComplete?.(totalPaid, lastSig)
      } catch (err: any) {
        console.error('Payroll tx failed:', err)
        setSigning(false)
        setTxError(err?.message || 'Transaction failed or rejected')
        setPayrollStep(2)
      }
      return
    }

    setPayrollStep(prev => Math.min(prev + 1, 4))
  }, [payrollStep, confirmChecked, publicKey, sendTransaction, connection, program, employees, onPayrollComplete])

  const copyTxHash = useCallback(() => {
    if (txSignature) navigator.clipboard.writeText(txSignature).catch(() => {})
  }, [txSignature])

  const closePanel = useCallback(() => {
    onClose()
    setTimeout(() => {
      setPayrollStep(1)
      setConfirmChecked(false)
      setPhaseStates(['idle', 'idle', 'idle'])
      setConfettiDots([])
      setTxSignature(null)
      setTxError(null)
      setSigning(false)
      setTxConfirmed(false)
    }, 280)
  }, [onClose])

  const getPanelTitle = () => {
    switch (payrollStep) {
      case 1: return 'Review Payroll Run'
      case 2: return 'Confirm Payroll'
      case 3: return 'Processing'
      case 4: return 'Success'
      default: return ''
    }
  }

  const getPanelCtaText = () => {
    if (payrollStep === 2 && signing) return 'Waiting for signature...'
    switch (payrollStep) {
      case 1: return 'Continue'
      case 2: return 'Sign & Pay'
      default: return 'Continue'
    }
  }

  const showPanelFooter = payrollStep === 1 || payrollStep === 2
  const panelCtaDisabled = (payrollStep === 2 && !confirmChecked) || signing

  const checkSvg = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  )

  const phaseOriginalIcons = [
    <svg key="p1" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    <svg key="p2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
    <svg key="p3" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  ]

  const phaseTexts = ['Encrypting...', 'Sending to Solana...', 'Confirming on-chain...']

  return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={closePanel}></div>
      <div className={`slide-panel ${open ? 'open' : ''}`}>
        <div className="panel-header">
          <h2>{getPanelTitle()}</h2>
          <button className="panel-close" onClick={closePanel} aria-label="Close panel">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="panel-body">
          {/* Step 1: Review */}
          <div className={`panel-step ${payrollStep === 1 ? 'active' : ''}`}>
            <div className="review-list">
              {employees.map((emp) => (
                <div className="review-item" key={emp.initials}>
                  <div className="avatar-sm" style={{ background: emp.bg, color: emp.color, width: 32, height: 32, fontSize: 12 }}>{emp.initials}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.wallet}</div>
                  </div>
                  <div className="conf-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    Confidential
                  </div>
                </div>
              ))}
            </div>
            <div className="review-summary">
              <span><span className="mono">{employees.length}</span> employees</span>
              <span>Est. fee: <span className="mono">0.02 SOL</span></span>
            </div>
          </div>

          {/* Step 2: Confirm */}
          <div className={`panel-step ${payrollStep === 2 ? 'active' : ''}`}>
            <div className="confirm-center">
              <div className="shield-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <p>All salary amounts will be encrypted before reaching the blockchain using Arcium's confidential transfer protocol.</p>
              <label className="confirm-checkbox">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                />
                I confirm this payroll run
              </label>
              {txError && (
                <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{txError}</p>
              )}
              {!publicKey && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12, textAlign: 'center' }}>Connect your wallet to sign</p>
              )}
            </div>
          </div>

          {/* Step 3: Processing */}
          <div className={`panel-step ${payrollStep === 3 ? 'active' : ''}`}>
            <div className="processing-phases">
              {phaseTexts.map((text, i) => {
                const state = phaseStates[i]
                return (
                  <div className="phase-item" key={i}>
                    <div className={`phase-icon ${state}`}>
                      {state === 'done' ? checkSvg : (
                        <span className={state === 'active' && i === 0 ? 'animate-spin' : ''} style={{ display: 'flex' }}>
                          {phaseOriginalIcons[i]}
                        </span>
                      )}
                    </div>
                    <span className={`phase-text ${state}`}>{text}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step 4: Success */}
          <div className={`panel-step ${payrollStep === 4 ? 'active' : ''}`}>
            <div className="success-center">
              <div className="confetti-container">
                {confettiDots.map((dot) => (
                  <div
                    key={dot.id}
                    className="confetti-dot"
                    style={{
                      left: dot.left,
                      backgroundColor: dot.color,
                      animationDelay: dot.delay,
                      animationDuration: dot.duration,
                      width: dot.size,
                      height: dot.size,
                    }}
                  />
                ))}
              </div>
              <div className="success-check">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h3>All {employees.length} team members have been paid</h3>
              <p>Payroll #13 completed successfully</p>
              <div className="tx-hash">
                <span className="mono">{txSignature ? `${txSignature.slice(0, 8)}...${txSignature.slice(-8)}` : 'No signature'}</span>
                <button className="copy-btn" onClick={copyTxHash} aria-label="Copy transaction hash">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
              </div>
              <div className="success-links">
                <a
                  href={txSignature ? `https://solscan.io/tx/${txSignature}?cluster=devnet` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-solscan"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  View on Solscan
                </a>
                <button className="link-done" onClick={closePanel}>Done</button>
              </div>
            </div>
          </div>
        </div>
        {showPanelFooter && (
          <div className="panel-footer">
            <button
              className="btn-panel-full purple"
              onClick={advancePayroll}
              disabled={panelCtaDisabled}
            >
              {getPanelCtaText()}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
