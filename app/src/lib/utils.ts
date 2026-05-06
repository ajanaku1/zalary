import { PublicKey } from '@solana/web3.js'

export function truncateAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr)
    return true
  } catch {
    return false
  }
}

export function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || '??'
}

export const AVATAR_COLORS = [
  { bg: 'var(--accent-subtle)', color: 'var(--accent)' },
  { bg: 'var(--accent-warm-subtle)', color: 'var(--accent-warm)' },
  { bg: 'rgba(0,184,148,0.12)', color: 'var(--success)' },
  { bg: 'rgba(253,203,110,0.12)', color: 'var(--warning)' },
  { bg: 'rgba(255,107,107,0.12)', color: 'var(--error)' },
]
