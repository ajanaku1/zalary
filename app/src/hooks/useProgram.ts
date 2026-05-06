import { useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider } from '@coral-xyz/anchor'
import type { Transaction, VersionedTransaction } from '@solana/web3.js'
import { getProgram } from '../lib/program'
import type { ZalaryProgram } from '../lib/program'

// Build an AnchorProvider directly from useWallet's adapter rather than going
// through useAnchorWallet, which silently returns undefined for some adapter
// states (e.g. Wallet Standard wallets where the signer interface is lazy).
export function useProgram(): ZalaryProgram | null {
  const { connection } = useConnection()
  const { connected, publicKey, signTransaction, signAllTransactions, wallet } = useWallet()

  return useMemo(() => {
    if (!connected || !publicKey || !signTransaction || !signAllTransactions) {
      if (connected && publicKey) {
        console.warn('[useProgram] connected but signing methods missing', {
          walletName: wallet?.adapter?.name,
          hasSignTransaction: !!signTransaction,
          hasSignAllTransactions: !!signAllTransactions,
        })
      }
      return null
    }
    try {
      const anchorWallet = {
        publicKey,
        signTransaction: signTransaction as <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>,
        signAllTransactions: signAllTransactions as <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>,
      }
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' })
      return getProgram(provider)
    } catch (err) {
      console.error('[useProgram] getProgram threw:', err)
      return null
    }
  }, [connection, connected, publicKey, signTransaction, signAllTransactions, wallet])
}
