// Token-2022 Confidential Transfer session.
// On connect: resolve mint → derive ElGamal/AES keys (signMessage) → ensure CT ATA.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import type { Transaction, TransactionSignature } from '@solana/web3.js'
import {
  applyPendingBalance,
  createConfidentialMint,
  deriveConfidentialKeys,
  ensureConfidentialTokenAccount,
  loadStoredMint,
  storeMint,
  type ConfidentialKeys,
} from '../lib/confidential'

export type CtStatus =
  | 'idle'
  | 'wallet-incompatible'
  | 'needs-mint'
  | 'deriving-keys'
  | 'configuring-account'
  | 'ready'
  | 'error'

interface ConfidentialContextValue {
  status: CtStatus
  error: string | null
  mint: string | null
  keys: ConfidentialKeys | null
  tokenAta: string | null
  retry: () => void
  createMint: () => Promise<void>
  applyPending: () => Promise<string>
  sendTransaction: (
    transaction: Transaction,
    connection: import('@solana/web3.js').Connection,
    options?: { signers?: import('@solana/web3.js').Signer[] },
  ) => Promise<TransactionSignature>
}

const ConfidentialContext = createContext<ConfidentialContextValue>({
  status: 'idle',
  error: null,
  mint: null,
  keys: null,
  tokenAta: null,
  retry: () => {},
  createMint: async () => {},
  applyPending: async () => '',
  sendTransaction: async () => {
    throw new Error('Wallet not ready')
  },
})

export function useConfidential() {
  return useContext(ConfidentialContext)
}

export default function ConfidentialProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, signMessage, sendTransaction: walletSend, signTransaction } = useWallet()
  const { connection } = useConnection()
  const [status, setStatus] = useState<CtStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [mint, setMint] = useState<string | null>(null)
  const [keys, setKeys] = useState<ConfidentialKeys | null>(null)
  const [tokenAta, setTokenAta] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const sendTransaction = useCallback(
    async (
      transaction: Transaction,
      conn: typeof connection,
      options?: { signers?: import('@solana/web3.js').Signer[] },
    ) => {
      if (!walletSend) throw new Error('Wallet cannot send transactions')
      return walletSend(transaction, conn, options)
    },
    [walletSend],
  )

  const retry = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!connected || !publicKey) {
        setStatus('idle')
        setError(null)
        setMint(null)
        setKeys(null)
        setTokenAta(null)
        return
      }
      if (!signMessage) {
        setStatus('wallet-incompatible')
        setError('Wallet must support signMessage (Phantom, Backpack, Solflare).')
        return
      }

      const wallet = publicKey.toBase58()
      // Prefer org-scoped mint; fall back to any invite-shared mint from query later.
      let resolvedMint = loadStoredMint(wallet)

      // Employee path: employer mint may be in localStorage under join flow
      if (!resolvedMint) {
        try {
          const shared = localStorage.getItem('zalary.ct.shared_mint')
          if (shared) {
            resolvedMint = shared
            storeMint(wallet, shared)
          }
        } catch { /* ignore */ }
      }

      if (!resolvedMint) {
        setMint(null)
        setKeys(null)
        setTokenAta(null)
        setStatus('needs-mint')
        setError(null)
        return
      }

      setMint(resolvedMint)
      setStatus('deriving-keys')
      setError(null)

      try {
        const derived = await deriveConfidentialKeys(publicKey, resolvedMint, signMessage)
        if (cancelled) return
        setKeys(derived)

        setStatus('configuring-account')
        const { token, signatures } = await ensureConfidentialTokenAccount({
          connection,
          owner: publicKey,
          mint: resolvedMint,
          keys: derived,
          sendTransaction,
        })
        if (cancelled) return
        setTokenAta(token)
        if (signatures.length) {
          console.log('[CT] configured account', signatures)
        }
        setStatus('ready')
      } catch (err: any) {
        if (cancelled) return
        console.error('[CT] init failed', err)
        setStatus('error')
        setError(err?.message ?? String(err))
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [connected, publicKey, signMessage, connection, sendTransaction, tick])

  const createMint = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error('Connect a wallet that supports signMessage')
    setStatus('configuring-account')
    setError(null)
    try {
      const { mint: newMint } = await createConfidentialMint({
        connection,
        owner: publicKey,
        signMessage,
        sendTransaction,
      })
      setMint(newMint)
      storeMint(publicKey.toBase58(), newMint)
      try {
        localStorage.setItem('zalary.ct.shared_mint', newMint)
      } catch { /* ignore */ }
      setTick((t) => t + 1)
    } catch (err: any) {
      setStatus('error')
      setError(err?.message ?? String(err))
      throw err
    }
  }, [publicKey, signMessage, connection, sendTransaction])

  const applyPending = useCallback(async () => {
    if (!publicKey || !mint || !keys) throw new Error('Confidential layer not ready')
    return applyPendingBalance({
      connection,
      owner: publicKey,
      mint,
      keys,
      sendTransaction,
    })
  }, [publicKey, mint, keys, connection, sendTransaction])

  const value = useMemo(
    () => ({
      status,
      error,
      mint,
      keys,
      tokenAta,
      retry,
      createMint,
      applyPending,
      sendTransaction,
    }),
    [status, error, mint, keys, tokenAta, retry, createMint, applyPending, sendTransaction],
  )

  // silence unused
  void signTransaction

  return (
    <ConfidentialContext.Provider value={value}>
      {children}
    </ConfidentialContext.Provider>
  )
}
