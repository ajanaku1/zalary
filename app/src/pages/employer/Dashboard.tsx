import { useState, useCallback, useEffect } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { usePrivy } from '@privy-io/react-auth'
import { PublicKey } from '@solana/web3.js'
import TopNav, { type EmployerTab } from '../../components/TopNav'
import PayrollPanel from './PayrollPanel'
import AddEmployee from './AddEmployee'
import EmployeeDetail from './EmployeeDetail'
import AuthGate from './AuthGate'
import Onboarding from './Onboarding'
import { useRole } from '../../contexts/RoleContext'
import { useProgram } from '../../hooks/useProgram'
import { createOrganization, addEmployee, findOrganizationPda, findTreasuryPda } from '../../lib/program'
import { encryptSalary } from '../../lib/arcium'
import { AVATAR_COLORS, deriveInitials, truncateAddress } from '../../lib/utils'
import type { Employee } from './EmployeeDetail'

// Devnet USDC mint address
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

const DEFAULT_EMPLOYEES: Employee[] = [
  { initials: 'AJ', name: 'Aisha Johnson', wallet: '7xKt...m4Fp', bg: 'var(--accent-subtle)', color: 'var(--accent)', dot: 'green' },
  { initials: 'MR', name: 'Marcus Rivera', wallet: '3vBn...q9Xz', bg: 'var(--accent-warm-subtle)', color: 'var(--accent-warm)', dot: 'green' },
  { initials: 'LP', name: 'Lena Petrov', wallet: '9aHk...w2Ty', bg: 'rgba(0,184,148,0.12)', color: 'var(--success)', dot: 'green' },
  { initials: 'TN', name: 'Tomas Nguyen', wallet: '5pWc...k8Rz', bg: 'rgba(253,203,110,0.12)', color: 'var(--warning)', dot: 'yellow' },
  { initials: 'SK', name: 'Sarah Kim', wallet: '2mFg...h7Qp', bg: 'rgba(255,107,107,0.12)', color: 'var(--error)', dot: 'green' },
  { initials: 'DA', name: 'David Adeyemi', wallet: '8nJx...v3Ld', bg: 'var(--accent-subtle)', color: 'var(--accent)', dot: 'green' },
]

interface OrgData {
  orgName: string
  employees: Array<{ name: string; wallet: string; salary: number }>
  treasuryAmount: number
  schedule: 'weekly' | 'biweekly' | 'monthly'
}

export default function Dashboard() {
  // Auth state
  const { connected, publicKey: walletPublicKey } = useWallet()
  const { connection } = useConnection()
  const { ready, authenticated } = usePrivy()
  const isLoggedIn = connected || (ready && authenticated)

  // Onboarding state (persisted in localStorage)
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('zalary_onboarded') === 'true'
  )
  const [savedOrgData, setSavedOrgData] = useState<OrgData | null>(() => {
    try {
      const stored = localStorage.getItem('zalary_org_data')
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  const [activeTab, setActiveTab] = useState<EmployerTab>('dashboard')
  const [payrollPanelOpen, setPayrollPanelOpen] = useState(false)
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>(() => {
    if (savedOrgData && savedOrgData.employees.length > 0) {
      return savedOrgData.employees.map((emp, i) => {
        const colorSet = AVATAR_COLORS[i % AVATAR_COLORS.length]
        return { initials: deriveInitials(emp.name), name: emp.name, wallet: truncateAddress(emp.wallet), walletFull: emp.wallet, bg: colorSet.bg, color: colorSet.color, dot: 'green' as const, salary: emp.salary }
      })
    }
    return DEFAULT_EMPLOYEES
  })
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const { role } = useRole()
  const program = useProgram()
  const [orgName, setOrgName] = useState('')
  const [txSignature, setTxSignature] = useState<string | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const handleOnboardingComplete = useCallback(async (data: OrgData) => {
    localStorage.setItem('zalary_onboarded', 'true')
    localStorage.setItem('zalary_org_data', JSON.stringify(data))
    if (program) localStorage.setItem('zalary_org_authority', program.provider.publicKey!.toBase58())
    setSavedOrgData(data)
    setOnboardingComplete(true)
    if (data.employees.length > 0) {
      const newEmps: Employee[] = data.employees.map((emp, i) => {
        const colorSet = AVATAR_COLORS[i % AVATAR_COLORS.length]
        return { initials: deriveInitials(emp.name), name: emp.name, wallet: truncateAddress(emp.wallet), walletFull: emp.wallet, bg: colorSet.bg, color: colorSet.color, dot: 'green' as const, salary: emp.salary }
      })
      setEmployees(newEmps)
    }
    // Fire add_employee on-chain for each onboarded employee (non-blocking, errors logged not thrown)
    if (program && data.employees.length > 0) {
      const authority = program.provider.publicKey!
      const [orgPda] = findOrganizationPda(authority)
      for (const emp of data.employees) {
        try {
          const walletPk = new PublicKey(emp.wallet)
          const encryptedBytes = await encryptSalary(emp.salary, emp.wallet)
          await addEmployee(program, orgPda, walletPk, Array.from(encryptedBytes))
        } catch (err) {
          console.warn('add_employee on-chain failed for', emp.wallet, err)
        }
      }
    }
  }, [program])

  // ALL hooks must be called before any early return (Rules of Hooks)
  const displayOrgName = savedOrgData?.orgName || undefined
  const [treasuryBalance, setTreasuryBalance] = useState(() => savedOrgData?.treasuryAmount || 0)
  const SCHEDULE_LABELS: Record<string, string> = { weekly: 'Weekly', monthly: 'Monthly', biweekly: 'Bi-weekly' }
  const scheduleLabel = SCHEDULE_LABELS[savedOrgData?.schedule ?? 'biweekly'] ?? 'Bi-weekly'
  const nextPayDate = (() => {
    const now = new Date()
    const s = savedOrgData?.schedule || 'biweekly'
    if (s === 'monthly') { const d = new Date(now.getFullYear(), now.getMonth() + 1, 1); return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }
    const friday = new Date(now)
    friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7))
    return friday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  })()
  const totalSalaries = employees.reduce((sum, e) => sum + (e.salary || 0), 0)
  const coverageMonths = totalSalaries > 0 ? (treasuryBalance / totalSalaries).toFixed(1) : '0'
  const coveragePct = totalSalaries > 0 ? Math.min(100, Math.round((treasuryBalance / (totalSalaries * 6)) * 100)) : 0

  const openPayrollPanel = useCallback(() => { setPayrollPanelOpen(true) }, [])
  const closePayrollPanel = useCallback(() => { setPayrollPanelOpen(false) }, [])
  const openAddEmployee = useCallback(() => { setAddEmployeeOpen(true) }, [])
  const closeAddEmployee = useCallback(() => { setAddEmployeeOpen(false) }, [])

  const handleEmployeeAdded = useCallback(async (emp: { name: string; wallet: string }) => {
    const colorSet = AVATAR_COLORS[employees.length % AVATAR_COLORS.length]
    setEmployees(prev => [...prev, { initials: deriveInitials(emp.name), name: emp.name, wallet: truncateAddress(emp.wallet), walletFull: emp.wallet, bg: colorSet.bg, color: colorSet.color, dot: 'green' }])
    setAddEmployeeOpen(false)

    // Placeholder encrypted salary (64 zero bytes) — updated later via EmployeeDetail
    if (program) {
      try {
        const [orgPda] = findOrganizationPda(program.provider.publicKey!)
        await addEmployee(program, orgPda, new PublicKey(emp.wallet), Array(64).fill(0))
      } catch (err) {
        console.warn('On-chain addEmployee failed (org may not exist yet):', err)
      }
    }
  }, [employees.length, program])

  const handleCreateOrg = useCallback(async () => {
    if (!orgName.trim()) return
    if (!program) {
      setOrgError('Connect your wallet first')
      return
    }
    setCreating(true); setOrgError(null); setTxSignature(null)
    try {
      const { tx } = await createOrganization(program, orgName.trim(), USDC_MINT)
      setTxSignature(tx)
      setShowCreateOrg(false); setOrgName('')
    } catch (err: any) {
      setOrgError(err?.message ?? 'Transaction failed')
    } finally { setCreating(false) }
  }, [orgName, program])

  useEffect(() => {
    if (!program || !walletPublicKey) return
    const [orgPda] = findOrganizationPda(walletPublicKey)
    const [treasuryPda] = findTreasuryPda(orgPda)

    ;(async () => {
      try {
        const { value } = await connection.getTokenAccountBalance(treasuryPda)
        setTreasuryBalance(value.uiAmount || 0)
      } catch {}

      try {
        const employeeAccounts = await (program.account as any).employee.all([
          { memcmp: { offset: 8, bytes: orgPda.toBase58() } },
        ])
        if (employeeAccounts.length === 0) return

        const storedNames: Record<string, string> = (() => {
          try {
            const stored = localStorage.getItem('zalary_org_data')
            const data: OrgData = stored ? JSON.parse(stored) : null
            return data ? Object.fromEntries(data.employees.map(e => [e.wallet, e.name])) : {}
          } catch {
            return {}
          }
        })()

        const loadedEmps: Employee[] = employeeAccounts.map((acc: any, i: number) => {
          const walletStr = (acc.account.wallet as PublicKey).toBase58()
          const name = storedNames[walletStr] || `${walletStr.slice(0, 4)}...${walletStr.slice(-4)}`
          const initials = name.includes(' ')
            ? name.split(/\s+/).map((w: string) => w[0]?.toUpperCase() || '').join('').slice(0, 2)
            : walletStr.slice(0, 2).toUpperCase()
          const colorSet = AVATAR_COLORS[i % AVATAR_COLORS.length]
          const statusKey = Object.keys(acc.account.status)[0]
          return {
            initials,
            name,
            wallet: `${walletStr.slice(0, 4)}...${walletStr.slice(-4)}`,
            walletFull: walletStr,
            bg: colorSet.bg,
            color: colorSet.color,
            dot: (statusKey === 'active' ? 'green' : 'yellow') as 'green' | 'yellow',
            encryptedSalary: new Uint8Array(acc.account.encryptedSalary as number[]),
          }
        })
        setEmployees(loadedEmps)
      } catch (err) {
        console.warn('Failed to load on-chain employees:', err)
      }
    })()
  }, [program, walletPublicKey, connection])

  const handleEmployeeClick = useCallback((emp: Employee) => {
    setSelectedEmployee(emp); setDetailPanelOpen(true)
  }, [])

  const handlePayrollComplete = useCallback((totalPaid: number, _txSig: string) => {
    if (totalPaid <= 0) return
    setTreasuryBalance(prev => {
      const newBalance = Math.max(0, prev - totalPaid)
      // Persist to localStorage
      try {
        const stored = localStorage.getItem('zalary_org_data')
        if (stored) {
          const data = JSON.parse(stored)
          data.treasuryAmount = newBalance
          localStorage.setItem('zalary_org_data', JSON.stringify(data))
          setSavedOrgData(data)
        }
      } catch {}
      return newBalance
    })
  }, [])

  const handleSalarySet = useCallback((wallet: string, salary: number, encrypted: Uint8Array, frequency: 'weekly' | 'biweekly' | 'monthly') => {
    setEmployees(prev => prev.map(emp => emp.wallet === wallet ? { ...emp, salary, encryptedSalary: encrypted, payFrequency: frequency } : emp))
    setSelectedEmployee(prev => prev && prev.wallet === wallet ? { ...prev, salary, encryptedSalary: encrypted, payFrequency: frequency } : prev)
  }, [])

  // Auth gates (after all hooks)
  if (!isLoggedIn) return <AuthGate onAuth={() => {}} />
  if (!onboardingComplete) return <Onboarding onComplete={handleOnboardingComplete} />

  const lockSvg12 = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
  )

  return (
    <div className="screen active">
      <TopNav variant="employer" activeTab={activeTab} onTabChange={setActiveTab} orgName={displayOrgName} />

      <main>
        {/* On-chain Create Organization */}
        {txSignature && (
          <div style={{ margin: '0 24px 16px', padding: '12px 16px', background: 'rgba(0,184,148,0.12)', borderRadius: 8, fontSize: 13 }}>
            Organization created on-chain.{' '}
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              View tx: {txSignature.slice(0, 8)}...{txSignature.slice(-8)}
            </a>
          </div>
        )}
        {orgError && (
          <div style={{ margin: '0 24px 16px', padding: '12px 16px', background: 'rgba(255,107,107,0.12)', borderRadius: 8, fontSize: 13, color: 'var(--error)' }}>
            {orgError}
          </div>
        )}

        {showCreateOrg && (
          <div style={{ margin: '0 24px 16px', padding: '16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-surface)' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Create Organization On-Chain</h4>
            <input
              type="text"
              placeholder="Organization name (max 64 chars)"
              maxLength={64}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreateOrg}
                disabled={creating || !orgName.trim()}
                className="qa-btn primary-action"
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                {creating ? 'Sending...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreateOrg(false); setOrgError(null) }}
                className="qa-btn secondary-action"
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
        <div className="dashboard-layout">
          <div className="dash-main">
            <div className="welcome-banner">
              <p>Good morning. You have a payroll run scheduled for <span className="mono-detail">{nextPayDate}</span>.</p>
            </div>
            <div className="treasury-card">
              <div className="treasury-header">
                <span className="label">Treasury Balance</span>
                <div className="actions">
                  <button>Fund</button>
                  {role !== 'admin' && <button>Withdraw</button>}
                </div>
              </div>
              <div className="treasury-amount">${treasuryBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div className="treasury-coverage">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Treasury covers {coverageMonths} months of payroll
                <div className="progress-bar"><div className="fill" style={{ width: `${coveragePct}%` }}></div></div>
              </div>
            </div>
            <div className="employee-grid-title">
              <span>Team Members</span>
              <span className="count mono">{employees.length} employees</span>
            </div>
            <div className="employee-grid">
              {employees.map((emp) => (
                <div className="employee-card" tabIndex={0} key={emp.initials} onClick={() => handleEmployeeClick(emp)} style={{ cursor: 'pointer' }}>
                  <div className="overlay">View Details</div>
                  <div className="emp-top">
                    <div className="emp-avatar" style={{ background: emp.bg, color: emp.color }}>{emp.initials}</div>
                    <div><div className="emp-name">{emp.name}</div><div className="emp-wallet mono">{emp.wallet}</div></div>
                  </div>
                  <div className="emp-bottom">
                    <div className="emp-salary">
                      {emp.encryptedSalary ? (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Encrypted</>
                      ) : (
                        <>{lockSvg12} Confidential</>
                      )}
                    </div>
                    <div className={`status-dot ${emp.dot}`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="dash-side">
            <div className="side-section">
              <h3>Quick Actions</h3>
              <div className="quick-actions">
                <button className="qa-btn primary-action" onClick={openPayrollPanel}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  Run Payroll
                </button>
                <button className="qa-btn secondary-action" onClick={openAddEmployee}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                  Add Employee
                </button>
                {role !== 'admin' && (
                <button className="qa-btn secondary-action" onClick={() => setShowCreateOrg(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Create Org On-Chain
                </button>
                )}
              </div>
            </div>
            <div className="side-section">
              <h3>Recent Activity</h3>
              <div className="activity-feed">
                <div className="activity-item"><span className="time">Just now</span><span className="desc">Organization <strong>{displayOrgName || 'created'}</strong> set up</span></div>
                {employees.length > 0 && <div className="activity-item"><span className="time">Just now</span><span className="desc"><strong>{employees.length} employees</strong> added to payroll</span></div>}
                {treasuryBalance > 0 && <div className="activity-item"><span className="time">Just now</span><span className="desc">Treasury funded: <strong className="mono">+{treasuryBalance.toLocaleString()} USDC</strong></span></div>}
                <div className="activity-item"><span className="time">Setup</span><span className="desc">Schedule set to <strong>{scheduleLabel}</strong></span></div>
              </div>
            </div>
            <div className="side-section">
              <h3>Next Payroll</h3>
              <div className="countdown-ring">
                <svg viewBox="0 0 80 80"><circle className="track" cx="40" cy="40" r="36"/><circle className="progress" cx="40" cy="40" r="36"/></svg>
                <div className="countdown-center"><div className="days">3</div><div className="label">days</div></div>
              </div>
              <div className="countdown-text">{nextPayDate} at 9:00 AM</div>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'team' && (
        <div className="dashboard-layout">
          <div className="dash-main">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Team Members</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Manage your employees and their payroll settings</p>
              </div>
              <button className="qa-btn primary-action" style={{ padding: '10px 20px' }} onClick={openAddEmployee}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                Add Employee
              </button>
            </div>
            <div className="employee-grid">
              {employees.map((emp) => (
                <div className="employee-card" tabIndex={0} key={emp.initials} onClick={() => handleEmployeeClick(emp)} style={{ cursor: 'pointer' }}>
                  <div className="overlay">View Details</div>
                  <div className="emp-top">
                    <div className="emp-avatar" style={{ background: emp.bg, color: emp.color }}>{emp.initials}</div>
                    <div><div className="emp-name">{emp.name}</div><div className="emp-wallet mono">{emp.wallet}</div></div>
                  </div>
                  <div className="emp-bottom">
                    <div className="emp-salary">
                      {emp.encryptedSalary ? (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Encrypted</>
                      ) : (
                        <>{lockSvg12} Confidential</>
                      )}
                    </div>
                    <div className={`status-dot ${emp.dot}`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="dash-side">
            <div className="side-section">
              <h3>Team Stats</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Active</span>
                  <span className="mono" style={{ color: 'var(--success)' }}>22</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Pending Verification</span>
                  <span className="mono" style={{ color: 'var(--warning)' }}>1</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Inactive</span>
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>1</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <span style={{ fontWeight: 500 }}>Total</span>
                  <span className="mono" style={{ fontWeight: 600 }}>24</span>
                </div>
              </div>
            </div>
            <div className="side-section">
              <h3>Invite Link</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Share this link to onboard new employees via Privy</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value="https://zalary.app/join/acme-corp" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} />
                <button className="qa-btn secondary-action" style={{ padding: '8px 12px', fontSize: 12 }}>Copy</button>
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'payroll' && (
        <div className="dashboard-layout">
          <div className="dash-main">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Payroll History</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>All payroll runs for your organization</p>
              </div>
              <button className="qa-btn primary-action" onClick={openPayrollPanel} style={{ padding: '10px 20px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                Run Payroll
              </button>
            </div>
            {[
              { id: '#12', date: 'Apr 1, 2026', employees: 24, status: 'Confirmed', tx: '4sGj...kQ7v' },
              { id: '#11', date: 'Mar 15, 2026', employees: 23, status: 'Confirmed', tx: '7xBn...m9Fp' },
              { id: '#10', date: 'Mar 1, 2026', employees: 23, status: 'Confirmed', tx: '2kHj...w4Tz' },
              { id: '#9', date: 'Feb 15, 2026', employees: 22, status: 'Confirmed', tx: '9aLp...q3Xz' },
              { id: '#8', date: 'Feb 1, 2026', employees: 22, status: 'Confirmed', tx: '5nRk...v8Yd' },
            ].map((run) => (
              <div key={run.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Payroll {run.id}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{run.date}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{run.employees} employees</span>
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(0,184,148,0.12)', color: 'var(--success)', fontWeight: 500 }}>{run.status}</span>
                  <a href="#" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{run.tx}</a>
                </div>
              </div>
            ))}
          </div>
          <div className="dash-side">
            <div className="side-section">
              <h3>Payroll Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Runs</span>
                  <span className="mono">12</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>This Month</span>
                  <span className="mono">1</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Next Scheduled</span>
                  <span className="mono" style={{ color: 'var(--accent)' }}>{nextPayDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Frequency</span>
                  <span>{scheduleLabel}</span>
                </div>
              </div>
            </div>
            <div className="side-section">
              <h3>Schedule</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Payroll runs {scheduleLabel.toLowerCase()} on {nextPayDate} at 9:00 AM UTC</p>
              <button className="qa-btn secondary-action" style={{ width: '100%', justifyContent: 'center' }}>Edit Schedule</button>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'treasury' && (
        <div className="dashboard-layout">
          <div className="dash-main">
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Treasury</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Manage your organization's USDC vault</p>
            </div>
            <div className="treasury-card">
              <div className="treasury-header">
                <span className="label">Treasury Balance</span>
                <div className="actions">
                  <button>Fund</button>
                  {role !== 'admin' && <button>Withdraw</button>}
                </div>
              </div>
              <div className="treasury-amount">${treasuryBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div className="treasury-coverage">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Treasury covers {coverageMonths} months of payroll
                <div className="progress-bar"><div className="fill" style={{ width: `${coveragePct}%` }}></div></div>
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Transaction History</h3>
              {[
                { type: 'Funded', amount: '+50,000 USDC', date: 'Apr 10, 2026', by: 'Owner', tx: '3nBk...q7Xz' },
                { type: 'Payroll #12', amount: '-87,200 USDC', date: 'Apr 1, 2026', by: 'Admin', tx: '4sGj...kQ7v' },
                { type: 'Funded', amount: '+100,000 USDC', date: 'Mar 20, 2026', by: 'Owner', tx: '8mFp...v2Ld' },
                { type: 'Payroll #11', amount: '-84,300 USDC', date: 'Mar 15, 2026', by: 'Admin', tx: '7xBn...m9Fp' },
                { type: 'Withdrawal', amount: '-25,000 USDC', date: 'Mar 10, 2026', by: 'Owner', tx: '1kHj...w4Tz' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{item.type}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.date}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: item.amount.startsWith('+') ? 'var(--success)' : 'var(--text-primary)' }}>{item.amount}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.by}</span>
                    <a href="#" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{item.tx}</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="dash-side">
            <div className="side-section">
              <h3>Vault Details</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                  <span>Solana Devnet</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Token</span>
                  <span className="mono">USDC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Funded</span>
                  <span className="mono">$450,000</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Disbursed</span>
                  <span className="mono">$262,500</span>
                </div>
              </div>
            </div>
            <div className="side-section">
              <h3>Access Roles</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 10 }}>AJ</div>
                    <span>Aisha J.</span>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--accent-subtle)', color: 'var(--accent)' }}>Owner</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 10 }}>MR</div>
                    <span>Marcus R.</span>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--accent-warm-subtle)', color: 'var(--accent-warm)' }}>Admin</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 10 }}>LP</div>
                    <span>Lena P.</span>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'rgba(0,184,148,0.12)', color: 'var(--success)' }}>Viewer</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </main>

      <PayrollPanel open={payrollPanelOpen} onClose={closePayrollPanel} employees={employees} onPayrollComplete={handlePayrollComplete} />
      <AddEmployee open={addEmployeeOpen} onClose={closeAddEmployee} onEmployeeAdded={handleEmployeeAdded} />
      <EmployeeDetail
        open={detailPanelOpen}
        onClose={() => setDetailPanelOpen(false)}
        employee={selectedEmployee}
        onSalarySet={handleSalarySet}
        onRemove={(wallet) => {
          setEmployees(prev => prev.filter(e => e.wallet !== wallet))
          setDetailPanelOpen(false)
          setSelectedEmployee(null)
        }}
      />
    </div>
  )
}
