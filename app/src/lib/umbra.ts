// Umbra SDK glue. Holds the network config and the bridge from a Solana
// wallet-adapter-react adapter to an IUmbraSigner.
//
// Privy embedded wallets are not yet supported here — they need a hand-rolled
// IUmbraSigner around Privy's signMessage / signTransaction APIs. Until that
// lands, shielded payroll requires a wallet-standard wallet (Phantom, Backpack,
// Solflare).

import { Keypair } from '@solana/web3.js'
import { sha256 } from '@noble/hashes/sha2'
import { createSignerFromPrivateKeyBytes } from '@umbra-privacy/sdk'

type UmbraSigner = Awaited<ReturnType<typeof createSignerFromPrivateKeyBytes>>

// Domain-separated message the user signs once with their main wallet to
// deterministically derive their shielded session keypair. The signature
// hashed to 32 bytes seeds an Ed25519 keypair via Keypair.fromSeed.
const SESSION_DERIVATION_MESSAGE =
  'Zalary shielded session — derive my Umbra signing key.\n\n' +
  'Signing this does not move funds. The resulting key is local to this device ' +
  'and is the only key that can decrypt your shielded balance.'

export interface ShieldedSession {
  /** Base58 pubkey of the shielded session keypair (Umbra signer address). */
  pubkey: string
  /** Solana Keypair for the shielded session — must be funded with SOL for fees. */
  keypair: Keypair
  /** Solana-kit-compatible IUmbraSigner ready to drop into getUmbraClient. */
  signer: UmbraSigner
}

const HELIUS = import.meta.env.VITE_HELIUS_RPC_URL as string | undefined

export const UMBRA_RPC_HTTP =
  HELIUS && HELIUS.startsWith('http')
    ? HELIUS
    : 'https://api.devnet.solana.com'

export const UMBRA_RPC_WS = UMBRA_RPC_HTTP.replace(/^http/, 'ws')

export const UMBRA_INDEXER = 'https://utxo-indexer.api-devnet.umbraprivacy.com'

export const UMBRA_RELAYER = 'https://relayer.api-devnet.umbraprivacy.com'

// Devnet test mints the Umbra relayer accepts (see /v1/relayer/info).
// dUSDC is the demo USDC stand-in for shielded payroll; users top up via
// faucet.umbraprivacy.com (1,000 dUSDC per wallet per hour).
export const UMBRA_DEMO_MINT = '4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7' // dUSDC
export const UMBRA_DEMO_MINT_SYMBOL = 'dUSDC'
export const UMBRA_DEMO_MINT_DECIMALS = 6
export const UMBRA_FAUCET_URL = 'https://faucet.umbraprivacy.com/'
// Both dev and prod route through the `/_umbra-faucet` proxy path. Vite serves
// it via `server.proxy` (vite.config.ts); Vercel serves it via the rewrite in
// `app/vercel.json`. Hitting `faucet.umbraprivacy.com` from the browser fails
// because that origin doesn't set CORS headers.
const UMBRA_FAUCET_API = '/_umbra-faucet/api/faucet'

export interface FaucetResult {
  ok: boolean
  /** Cooldown remaining message ("56m") if 429, or generic error message otherwise. */
  message: string
  /** Raw signature returned by the faucet on success, if any. */
  signature?: string
}

/**
 * Hit Umbra's public devnet faucet. Returns 1,000 dUSDC or dUSDT to the given
 * wallet, rate-limited to once per hour per wallet+token. CORS is open so this
 * works directly from the browser.
 */
export async function claimFromFaucet(
  wallet: string,
  token: 'dUSDC' | 'dUSDT' = 'dUSDC',
): Promise<FaucetResult> {
  const res = await fetch(UMBRA_FAUCET_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, token }),
  })
  let body: any = null
  try { body = await res.json() } catch { /* ignore */ }
  if (res.ok) {
    return { ok: true, message: 'Claimed', signature: body?.signature }
  }
  return { ok: false, message: body?.error ?? `Faucet returned ${res.status}` }
}

/**
 * Derive a deterministic shielded-session keypair from a wallet's signMessage.
 * The user signs SESSION_DERIVATION_MESSAGE once; the signature hashed via
 * SHA-256 becomes the Ed25519 seed. Same wallet always recovers the same
 * session keypair, but the session pubkey is intentionally distinct from the
 * user's main wallet — the shielded sub-wallet model.
 *
 * The 32-byte seed is cached in sessionStorage keyed by the connected wallet
 * pubkey, so reloading the page re-recovers the same session without prompting
 * the wallet again. The cache lives only for the duration of the browser tab
 * and is wiped automatically when the tab closes. We intentionally do NOT use
 * localStorage — that would persist the seed across tabs/sessions and turn the
 * shielded sub-wallet into a long-term cookie.
 */
const SEED_CACHE_PREFIX = 'zalary.shielded-session.seed.'

export async function deriveShieldedSession(
  walletPubkey: string,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<ShieldedSession> {
  const cacheKey = `${SEED_CACHE_PREFIX}${walletPubkey}`
  let seed: Uint8Array | null = null
  try {
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      const bytes = Uint8Array.from(atob(cached), (c) => c.charCodeAt(0))
      if (bytes.length === 32) seed = bytes
    }
  } catch { /* sessionStorage unavailable (private mode etc.) — fall through */ }

  if (!seed) {
    const messageBytes = new TextEncoder().encode(SESSION_DERIVATION_MESSAGE)
    const signature = await signMessage(messageBytes)
    seed = sha256(signature)
    try {
      const b64 = btoa(String.fromCharCode(...seed))
      sessionStorage.setItem(cacheKey, b64)
    } catch { /* no-op */ }
  }

  const keypair = Keypair.fromSeed(seed)
  const signer = await createSignerFromPrivateKeyBytes(keypair.secretKey)
  return { pubkey: keypair.publicKey.toBase58(), keypair, signer }
}
