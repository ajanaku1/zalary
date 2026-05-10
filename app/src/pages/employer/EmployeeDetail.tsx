import { useState, useCallback, useEffect } from 'react'
import { decryptSalary } from '../../lib/salary_crypto'
import WalletName from '../../components/WalletName'

export interface Employee {
  initials: string
  name: string
  wallet: string       // truncated display e.g. "7xKt...m4Fp"
  walletFull?: string  // full base58 address for on-chain calls
  bg: string
  color: string
  dot: string
  salary?: number
  encryptedSalary?: Uint8Array
  payFrequency?: 'weekly' | 'biweekly' | 'monthly'
}

interface EmployeeDetailProps {
  open: boolean
  onClose: () => void
  employee: Employee | null
  onSalarySet: (wallet: string, salary: number, encrypted: Uint8Array, frequency: 'weekly' | 'biweekly' | 'monthly') => void
  onRemove?: (wallet: string) => void
}

export default function EmployeeDetail({ open, onClose, employee, onSalarySet, onRemove }: EmployeeDetailProps) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [salaryInput, setSalaryInput] = useState('')
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly')
  const [encrypting, setEncrypting] = useState(false)
  const [encrypted, setEncrypted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && employee) {
      setFrequency(employee.payFrequency || 'monthly')
      setEncrypted(!!employee.encryptedSalary)
      setError(null)
      document.body.style.overflow = 'hidden'

      // If we already have a plaintext salary in memory, use it. Otherwise try to
      // decrypt the on-chain blob so the employer can see and edit the value
      // without re-typing it.
      if (employee.salary) {
        setSalaryInput(String(employee.salary))
      } else if (employee.encryptedSalary) {
        decryptSalary(employee.encryptedSalary, employee.wallet)
          .then(amount => {
            if (amount && Number.isFinite(amount) && amount > 0) {
              setSalaryInput(String(Math.round(amount)))
            }
          })
          .catch(() => { /* leave input blank, user re-enters */ })
      } else {
        setSalaryInput('')
      }
    } else {
      document.body.style.overflow = ''
    }
  }, [open, employee])

  const handleEncryptAndSave = useCallback(async () => {
    // Salary "encryption" used to live here as a placeholder AES-256-GCM blob
    // before Umbra. With shielded payroll, the only privacy that matters is
    // the Umbra UTXO ciphertext on-chain — local salary plaintext is fine and
    // never leaves the browser. So this just persists the amount + frequency.
    if (!employee) return
    const amount = parseFloat(salaryInput)
    if (!amount || amount <= 0) {
      setError('Enter a valid salary amount')
      return
    }
    setEncrypting(true)
    setError(null)
    try {
      // Empty Uint8Array kept for the existing onSalarySet signature; the
      // parent now ignores this field when persisting to localStorage.
      onSalarySet(employee.wallet, amount, new Uint8Array(), frequency)
      setEncrypted(true)
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setEncrypting(false)
    }
  }, [employee, salaryInput, frequency, onSalarySet])

  const lockSvg = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
  )

  if (!employee) return null

  return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={onClose}></div>
      <div className={`slide-panel ${open ? 'open' : ''}`}>
        <div className="panel-header">
          <h2>Employee Details</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close panel">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="panel-body">
          {/* Employee Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div className="emp-avatar" style={{ background: employee.bg, color: employee.color, width: 48, height: 48, fontSize: 18 }}>
              {employee.initials}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{employee.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}><WalletName wallet={employee.walletFull || employee.wallet} showAvatar /></div>
            </div>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status:</span>
            <span style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              background: employee.dot === 'green' ? 'rgba(0,184,148,0.12)' : 'rgba(253,203,110,0.12)',
              color: employee.dot === 'green' ? 'var(--success)' : 'var(--warning)',
              fontWeight: 500,
            }}>
              {employee.dot === 'green' ? 'Active' : 'Pending'}
            </span>
          </div>

          {encrypted && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 20,
            }}>
              {lockSvg}
              Saved
            </div>
          )}

          {/* Salary Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Salary (USDC)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="e.g. 8500"
              value={salaryInput}
              onChange={(e) => { setSalaryInput(e.target.value); setEncrypted(false) }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                fontSize: 15,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Pay Frequency */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>
              Pay Frequency
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['weekly', 'biweekly', 'monthly'] as const).map((freq) => (
                <button
                  key={freq}
                  onClick={() => setFrequency(freq)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: frequency === freq ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    background: frequency === freq ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                    color: frequency === freq ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {freq === 'biweekly' ? 'Bi-weekly' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          <button
            className="qa-btn primary-action"
            onClick={handleEncryptAndSave}
            disabled={encrypting}
            style={{ width: '100%', justifyContent: 'center', padding: '12px 20px', fontSize: 14 }}
          >
            {encrypting ? 'Saving…' : 'Save salary'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
            Salary stays in your browser. The amount is only encrypted on-chain when you run shielded payroll, where it becomes an Umbra UTXO.
          </p>

          {/* Remove Employee */}
          {onRemove && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              {!confirmRemove ? (
                <button
                  onClick={() => setConfirmRemove(true)}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    background: 'transparent',
                    border: '1px solid var(--error)',
                    color: 'var(--error)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    minHeight: 48,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                  Remove Employee
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 13, color: 'var(--error)', textAlign: 'center' }}>Remove {employee?.name} from payroll?</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { if (employee) { onRemove(employee.wallet); onClose() } }}
                      style={{
                        flex: 1, padding: '10px', fontSize: 13, fontWeight: 600,
                        background: 'var(--error)', color: '#fff', border: 'none',
                        borderRadius: 'var(--radius)', cursor: 'pointer', minHeight: 44,
                      }}
                    >
                      Yes, Remove
                    </button>
                    <button
                      onClick={() => setConfirmRemove(false)}
                      style={{
                        flex: 1, padding: '10px', fontSize: 13, fontWeight: 600,
                        background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: 'none',
                        borderRadius: 'var(--radius)', cursor: 'pointer', minHeight: 44,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
