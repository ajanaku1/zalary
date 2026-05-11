// UmbraProvider holds the Umbra client tied to the user's shielded session
// keypair, and runs the idempotent registration flow on first connect.
//
// Why a session keypair:
//   Solana Kit's wallet-standard signing bridge (createSignerFromWalletAccount)
//   fails signature verification against Phantom's signTransaction in v4 of the
//   SDK. Rather than fight that bridge, we derive a deterministic shielded
//   sub-wallet from the user's main wallet via a single signMessage prompt.
//   Same main wallet → same shielded session, every time. The session pubkey
//   is intentionally distinct from the public wallet — that's the privacy
//   wedge: the shielded balance is held by an address that nobody on-chain
//   can link back to the public identity unless the user reveals it.
//
// Lifecycle:
//   1. Wallet connects.
//   2. We prompt signMessage(SESSION_DERIVATION_MESSAGE) — one-time, no funds.
//   3. Signature → SHA-256 → 32-byte Ed25519 seed → session Keypair.
//   4. Session keypair → IUmbraSigner → Umbra client.
//   5. register({ confidential: true }) runs idempotently.
//   6. If the session pubkey isn't funded with SOL, registration will fail
//      with a "session-underfunded" status; UI must prompt the user to top up.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, type Keypair } from '@solana/web3.js'
import {
  getUmbraClient,
  getUserRegistrationFunction,
} from '@umbra-privacy/sdk'
import { getUserRegistrationProver } from '@umbra-privacy/web-zk-prover'
import {
  UMBRA_INDEXER,
  UMBRA_RPC_HTTP,
  UMBRA_RPC_WS,
  deriveShieldedSession,
} from '../lib/umbra'

type UmbraClient = Awaited<ReturnType<typeof getUmbraClient>>

// Threshold to require a top-up. Each Solana tx costs ~5,000 lamports, so
// 0.005 SOL covers ~1,000 txs of headroom. The fund button sends 0.05 SOL,
// so this check only fires when the session is genuinely empty — not after
// every single fee deduction.
const MIN_SESSION_FUNDING_LAMPORTS = 0.005 * LAMPORTS_PER_SOL

export type UmbraStatus =
  | 'idle'
  | 'wallet-incompatible'
  | 'awaiting-session-signature'
  | 'session-underfunded'
  | 'building-client'
  | 'registering'
  | 'proving-anonymous'
  | 'ready'
  | 'error'

interface UmbraContextValue {
  client: UmbraClient | null
  sessionPubkey: string | null
  sessionKeypair: Keypair | null
  status: UmbraStatus
  error: string | null
  registrationSignatures: string[]
  anonymousReady: boolean
  /** Re-run the init flow after the user funds the session. */
  retry: () => void
  /**
   * Idempotently register anonymous mode (downloads ~20MB of zk assets and
   * generates a Groth16 proof on first call). Required before any UTXO op.
   * Resolves to true when the on-chain account is anonymous-active.
   */
  ensureAnonymous: () => Promise<boolean>
}

const UmbraContext = createContext<UmbraContextValue>({
  client: null,
  sessionPubkey: null,
  sessionKeypair: null,
  status: 'idle',
  error: null,
  registrationSignatures: [],
  anonymousReady: false,
  retry: () => {},
  ensureAnonymous: async () => false,
})

export function useUmbra() {
  return useContext(UmbraContext)
}

interface Props {
  children: ReactNode
}

export default function UmbraProvider({ children }: Props) {
  const { wallet, connected, publicKey, signMessage } = useWallet()
  const { connection } = useConnection()
  const [client, setClient] = useState<UmbraClient | null>(null)
  const [sessionKeypair, setSessionKeypair] = useState<Keypair | null>(null)
  const [status, setStatus] = useState<UmbraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<string[]>([])
  const [anonymousReady, setAnonymousReady] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const generationRef = useRef(0)
  const anonymousInFlightRef = useRef<Promise<boolean> | null>(null)

  const adapterKey = useMemo(
    () => (connected && publicKey ? publicKey.toBase58() : null),
    [connected, publicKey],
  )

  const retry = useCallback(() => setRetryToken((t) => t + 1), [])

  const ensureAnonymous = useCallback(async () => {
    if (anonymousReady) return true
    if (anonymousInFlightRef.current) return anonymousInFlightRef.current
    if (!client) return false

    const promise = (async () => {
      try {
        setStatus('proving-anonymous')
        const zkProver = getUserRegistrationProver()
        const register = getUserRegistrationFunction({ client }, { zkProver })
        await register({ confidential: false, anonymous: true })
        setAnonymousReady(true)
        setStatus('ready')
        return true
      } catch (err: any) {
        console.error('[Umbra] anonymous registration failed', err)
        setError(err?.message ?? String(err))
        setStatus('error')
        return false
      } finally {
        anonymousInFlightRef.current = null
      }
    })()
    anonymousInFlightRef.current = promise
    return promise
  }, [anonymousReady, client])

  useEffect(() => {
    if (!adapterKey || !wallet) {
      setClient(null)
      setSessionKeypair(null)
      setStatus('idle')
      setError(null)
      setSignatures([])
      return
    }

    if (!signMessage) {
      setStatus('wallet-incompatible')
      setError('Connect a wallet that supports message signing (Phantom, Backpack, Solflare).')
      return
    }

    const generation = ++generationRef.current
    let cancelled = false

    async function run() {
      try {
        if (cancelled) return
        setStatus('awaiting-session-signature')
        setError(null)
        const session = await deriveShieldedSession(adapterKey!, signMessage!)
        if (cancelled || generationRef.current !== generation) return
        setSessionKeypair(session.keypair)

        // Session needs SOL for the registration tx fees.
        const lamports = await connection.getBalance(session.keypair.publicKey).catch(() => 0)
        if (lamports < MIN_SESSION_FUNDING_LAMPORTS) {
          if (cancelled) return
          setStatus('session-underfunded')
          setError(
            `Top up ${session.pubkey.slice(0, 8)}…${session.pubkey.slice(-4)} with at least 0.05 SOL on devnet, then click Retry.`,
          )
          return
        }

        if (cancelled) return
        setStatus('building-client')
        const next = await getUmbraClient({
          signer: session.signer,
          network: 'devnet',
          rpcUrl: UMBRA_RPC_HTTP,
          rpcSubscriptionsUrl: UMBRA_RPC_WS,
          indexerApiEndpoint: UMBRA_INDEXER,
        })
        if (cancelled || generationRef.current !== generation) return

        setClient(next)
        setStatus('registering')
        // Auto-flow only registers confidential mode — guaranteed cheap and
        // never blocks the UI. Anonymous mode (which needs a Groth16 proof
        // and ~20MB of wasm/zkey assets) fires lazily via ensureAnonymous()
        // when a UTXO surface actually needs it.
        const register = getUserRegistrationFunction({ client: next })
        const sigs = await register({ confidential: true, anonymous: false })
        if (cancelled || generationRef.current !== generation) return

        setSignatures(sigs)
        setAnonymousReady(false)
        setStatus('ready')
      } catch (err: any) {
        if (cancelled) return
        console.error('[Umbra] init failed', err)
        setStatus('error')
        setError(err?.message ?? String(err))
      }
    }

    void run()
    return () => { cancelled = true }
  }, [adapterKey, wallet, signMessage, connection, retryToken])

  const value = useMemo<UmbraContextValue>(
    () => ({
      client,
      sessionPubkey: sessionKeypair ? sessionKeypair.publicKey.toBase58() : null,
      sessionKeypair,
      status,
      error,
      registrationSignatures: signatures,
      anonymousReady,
      retry,
      ensureAnonymous,
    }),
    [client, sessionKeypair, status, error, signatures, anonymousReady, retry, ensureAnonymous],
  )

  return <UmbraContext.Provider value={value}>{children}</UmbraContext.Provider>
}
