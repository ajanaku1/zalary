// Local history tracking for confidential payroll runs and treasury ops.
// Token-2022 CT encrypts amounts on-chain; we still keep a private client-side
// activity log for the employer dashboard (per-wallet localStorage).

export interface PayrollEntry {
  id: string
  timestamp: number
  totalAmount: number
  employeeCount: number
  signature: string | null
}

export interface TreasuryEntry {
  id: string
  timestamp: number
  kind: 'deposit' | 'withdraw' | 'faucet'
  amount: number
  signature: string | null
}

const HISTORY_EVENT = 'zalary:history-updated'
const MAX_ENTRIES = 100

function key(wallet: string, kind: 'payroll' | 'treasury'): string {
  return `zalary_${kind}_history:${wallet}`
}

function readList<T>(wallet: string, kind: 'payroll' | 'treasury'): T[] {
  if (!wallet) return []
  try {
    const raw = localStorage.getItem(key(wallet, kind))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeList<T>(wallet: string, kind: 'payroll' | 'treasury', list: T[]): void {
  if (!wallet) return
  try {
    localStorage.setItem(key(wallet, kind), JSON.stringify(list.slice(0, MAX_ENTRIES)))
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT))
  } catch { /* localStorage full / disabled — non-fatal */ }
}

export function recordPayroll(wallet: string, entry: PayrollEntry): void {
  const list = readList<PayrollEntry>(wallet, 'payroll')
  list.unshift(entry)
  writeList(wallet, 'payroll', list)
}

export function recordTreasury(wallet: string, entry: TreasuryEntry): void {
  const list = readList<TreasuryEntry>(wallet, 'treasury')
  list.unshift(entry)
  writeList(wallet, 'treasury', list)
}

export function readPayrollHistory(wallet: string): PayrollEntry[] {
  return readList<PayrollEntry>(wallet, 'payroll')
}

export function readTreasuryHistory(wallet: string): TreasuryEntry[] {
  return readList<TreasuryEntry>(wallet, 'treasury')
}

export { HISTORY_EVENT }
