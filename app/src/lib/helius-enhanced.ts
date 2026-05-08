// Helius — three deep integrations beyond plain RPC.
//
//   1. Enhanced Transactions API: parse Zalary instructions into named labels
//      ('runPayroll', 'claimFunds', etc.) by matching the leading 8 bytes of
//      each ix data blob against the Anchor IDL discriminators. Helius hands us
//      the parsed accountData and instructions array; we annotate it with our
//      program's vocabulary.
//
//   2. Priority Fee API: getPriorityFeeEstimate is a Helius RPC extension that
//      reads the cluster's recent priority-fee distribution and returns a
//      per-CU estimate. Used by run_payroll so payroll txs land fast under
//      mainnet congestion. Devnet returns 0 — that's expected.
//
//   3. Live program logs subscription (used by useHeliusLogStream) — pushes a
//      notification when a tx mentioning our program ID lands, with no polling.
//
// Privacy note: every call here uses public on-chain data only. No viewing
// keys, no plaintext balances, nothing client-decrypted. PRIVACY.md applies.

import { Connection, PublicKey } from '@solana/web3.js'
import { IDL } from './zalary_idl'
import { PROGRAM_ID } from './program'

const HELIUS_BASE = (() => {
  const url = import.meta.env.VITE_HELIUS_RPC_URL as string | undefined
  if (!url) return null
  // Helius RPC URL pattern: https://<cluster>.helius-rpc.com/?api-key=KEY
  // Enhanced API lives at https://api-<cluster>.helius.xyz/v0/...
  const m = url.match(/https?:\/\/(devnet|mainnet)\.helius-rpc\.com\/\?api-key=([^&]+)/)
  if (!m) return null
  return { cluster: m[1], apiKey: m[2] }
})()

export function isHeliusEnhancedAvailable(): boolean {
  return HELIUS_BASE !== null
}

// --- 1. Enhanced Transactions API --------------------------------------------

interface HeliusEnhancedTx {
  signature: string
  type?: string
  description?: string
  timestamp?: number
  fee?: number
  feePayer?: string
  instructions?: Array<{
    programId: string
    data?: string  // base58
    accounts?: string[]
  }>
  transactionError?: { error: string } | null
}

export interface EnrichedTx {
  signature: string
  blockTime: number
  feePayer: string
  fee: number
  success: boolean
  zalaryInstructions: string[]  // human names like ['runPayroll'] or [] if none
  description?: string
}

// Discriminator (first 8 bytes of ix data) → instruction name.
const DISCRIMINATOR_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const ix of IDL.instructions as unknown as Array<{ name: string; discriminator: number[] }>) {
    map[ix.discriminator.join(',')] = ix.name
  }
  return map
})()

export async function fetchEnhancedTransactions(signatures: string[]): Promise<HeliusEnhancedTx[]> {
  if (!HELIUS_BASE || signatures.length === 0) return []
  const url = `https://api-${HELIUS_BASE.cluster}.helius.xyz/v0/transactions/?api-key=${HELIUS_BASE.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: signatures }),
  })
  if (!res.ok) throw new Error(`Helius enhanced ${res.status}`)
  return (await res.json()) as HeliusEnhancedTx[]
}

export function decodeZalaryInstructions(tx: HeliusEnhancedTx): string[] {
  const out: string[] = []
  for (const ix of tx.instructions ?? []) {
    if (ix.programId !== PROGRAM_ID.toBase58()) continue
    const name = nameFromBase58Data(ix.data)
    if (name) out.push(name)
  }
  return out
}

function nameFromBase58Data(data?: string): string | null {
  if (!data) return null
  try {
    const bytes = base58Decode(data).slice(0, 8)
    return DISCRIMINATOR_MAP[Array.from(bytes).join(',')] ?? null
  } catch { return null }
}

// Tiny base58 decoder (avoid pulling another dep when we only decode short blobs).
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Decode(s: string): Uint8Array {
  let num = 0n
  for (const c of s) {
    const idx = BASE58_ALPHABET.indexOf(c)
    if (idx < 0) throw new Error('bad base58')
    num = num * 58n + BigInt(idx)
  }
  const bytes: number[] = []
  while (num > 0n) { bytes.unshift(Number(num & 0xffn)); num >>= 8n }
  for (let i = 0; i < s.length && s[i] === '1'; i++) bytes.unshift(0)
  return new Uint8Array(bytes)
}

// --- 2. Priority Fee API -----------------------------------------------------

export type PriorityLevel = 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax'

export async function getPriorityFeeEstimate(
  _connection: Connection,
  accountKeys: PublicKey[],
  level: PriorityLevel = 'High',
): Promise<number> {
  if (!HELIUS_BASE) return 0  // devnet w/o helius — fall back to no priority fee
  try {
    const url = `https://${HELIUS_BASE.cluster}.helius-rpc.com/?api-key=${HELIUS_BASE.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'zalary-priority-fee',
        method: 'getPriorityFeeEstimate',
        params: [{
          accountKeys: accountKeys.map(k => k.toBase58()),
          options: { priorityLevel: level, includeAllPriorityFeeLevels: false },
        }],
      }),
    })
    if (!res.ok) return 0
    const json = await res.json() as { result?: { priorityFeeEstimate?: number } }
    return Math.ceil(json.result?.priorityFeeEstimate ?? 0)
  } catch {
    return 0
  }
}

// --- 3. Logs subscription helper --------------------------------------------
// Returns an unsubscribe fn. Wraps connection.onLogs so callers don't have to
// know about subscription IDs.
export function subscribeProgramLogs(
  connection: Connection,
  onMatch: (sig: string) => void,
): () => void {
  const subId = connection.onLogs(PROGRAM_ID, (log) => {
    if (log.err) return
    onMatch(log.signature)
  }, 'confirmed')
  return () => { connection.removeOnLogsListener(subId).catch(() => {}) }
}
