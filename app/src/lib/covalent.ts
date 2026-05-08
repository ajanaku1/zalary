// Covalent (GoldRush) client. Browser-only. Honors PRIVACY.md.
//
// Privacy contract enforced here:
//   - No PII in queries. Only wallet/PDA pubkeys (already public on-chain) and
//     program IDs reach Covalent.
//   - No viewing keys, no plaintext amounts, no employee names cross this boundary.
//   - Devnet falls back to direct RPC. Covalent's Solana API is mainnet-only,
//     and Zalary's hackathon deployment is on devnet, so this file is built to
//     degrade gracefully without losing the feature.
//
// See PRIVACY.md for the full contract this file answers to.

import { connection, NETWORK } from './helius'
import { PROGRAM_ID } from './program'
import { PublicKey } from '@solana/web3.js'

const COVALENT_BASE = 'https://api.covalenthq.com/v1'
const SOLANA_CHAIN = 'solana-mainnet'
const API_KEY = import.meta.env.VITE_COVALENT_API_KEY as string | undefined

// Showcase wallets for the Insights "demo mode" toggle. Zalary lives on devnet,
// Covalent indexes mainnet only, so the live Insights tab would show empty
// cards without an override. When demo mode is on, Covalent queries run
// against these mainnet addresses so the integration is visible to judges.
const SHOWCASE_WALLET_SOL = import.meta.env.VITE_DEMO_SHOWCASE_WALLET_SOL as string | undefined
const SHOWCASE_WALLET_EVM = import.meta.env.VITE_DEMO_SHOWCASE_WALLET_EVM as string | undefined

export type AnalyticsMode = 'covalent' | 'rpc'

const SETTING_KEY = 'zalary_analytics_mode'
const DEMO_KEY = 'zalary_demo_mode'

export function getAnalyticsMode(): AnalyticsMode {
  const stored = localStorage.getItem(SETTING_KEY)
  if (stored === 'covalent' || stored === 'rpc') return stored
  return API_KEY && NETWORK !== 'devnet' ? 'covalent' : 'rpc'
}

export function setAnalyticsMode(mode: AnalyticsMode) {
  localStorage.setItem(SETTING_KEY, mode)
}

export function isCovalentAvailable(): boolean {
  return Boolean(API_KEY) && NETWORK !== 'devnet'
}

// True if a Covalent API key is set, regardless of network. Used by the demo-
// mode row in the analytics banner — that row exists precisely because Zalary
// is on devnet, so it must not be gated behind a mainnet check.
export function hasCovalentKey(): boolean {
  return Boolean(API_KEY)
}

// Demo-mode toggle. When ON and a showcase wallet is configured, Insights
// queries Covalent against the showcase wallet so the integration shows real
// mainnet activity. UI must surface a "Demo data" badge so this isn't
// mistaken for the user's own treasury.
export function getDemoMode(): boolean {
  return localStorage.getItem(DEMO_KEY) === '1'
}

export function setDemoMode(on: boolean): void {
  localStorage.setItem(DEMO_KEY, on ? '1' : '0')
}

export function getShowcaseWalletSol(): string | null {
  return SHOWCASE_WALLET_SOL ?? null
}

export function getShowcaseWalletEvm(): string | null {
  return SHOWCASE_WALLET_EVM ?? null
}

export function isShowcaseAvailable(): boolean {
  return Boolean(SHOWCASE_WALLET_SOL)
}

export interface ProgramTx {
  signature: string
  blockTime: number  // unix seconds
  feePayer: string
  fee: number  // lamports
  success: boolean
}

interface CovalentTxItem {
  tx_hash: string
  block_signed_at: string
  from_address: string
  fees_paid?: string | number
  successful?: boolean
  log_events?: unknown
  instructions?: unknown
}

interface CovalentResponse {
  data?: { items?: CovalentTxItem[] }
}

// Fetch txs touching a wallet. Returns Zalary-program txs only — filtering happens
// after the indexer call so Covalent never learns we care about a specific program ID
// on a per-user basis (it learns it once at install time via the public app key).
export async function getProgramTxsForWallet(wallet: PublicKey, limit = 100): Promise<ProgramTx[]> {
  return getAnalyticsMode() === 'covalent' && isCovalentAvailable()
    ? fetchTxsCovalent(wallet, limit)
    : fetchTxsRpc(wallet, limit)
}

async function fetchTxsCovalent(wallet: PublicKey, limit: number): Promise<ProgramTx[]> {
  const url = `${COVALENT_BASE}/${SOLANA_CHAIN}/address/${wallet.toBase58()}/transactions_v3/?key=${API_KEY}&page-size=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Covalent ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as CovalentResponse
  const items = json.data?.items ?? []
  return items
    .filter(item => mentionsProgram(item, PROGRAM_ID))
    .map(item => ({
      signature: item.tx_hash,
      blockTime: Math.floor(new Date(item.block_signed_at).getTime() / 1000),
      feePayer: item.from_address,
      fee: Number(item.fees_paid ?? 0),
      success: item.successful !== false,
    }))
}

function mentionsProgram(item: CovalentTxItem, program: PublicKey): boolean {
  const blob = JSON.stringify(item.log_events ?? item.instructions ?? item)
  return blob.includes(program.toBase58())
}

async function fetchTxsRpc(wallet: PublicKey, limit: number): Promise<ProgramTx[]> {
  const sigs = await connection.getSignaturesForAddress(wallet, { limit })
  const detailed = await Promise.all(
    sigs.map(s => connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }))
  )
  const out: ProgramTx[] = []
  for (let i = 0; i < sigs.length; i++) {
    const tx = detailed[i]
    if (!tx) continue
    if (!txTouchesProgram(tx, PROGRAM_ID)) continue
    out.push({
      signature: sigs[i].signature,
      blockTime: sigs[i].blockTime ?? 0,
      feePayer: tx.transaction.message.staticAccountKeys[0]?.toBase58() ?? '',
      fee: tx.meta?.fee ?? 0,
      success: !tx.meta?.err,
    })
  }
  return out
}

interface RpcTxLike {
  transaction: { message: { staticAccountKeys?: PublicKey[] } }
}

function txTouchesProgram(tx: RpcTxLike, program: PublicKey): boolean {
  const keys = tx.transaction.message.staticAccountKeys ?? []
  return keys.some(k => k.equals(program))
}
