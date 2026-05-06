import { useMemo } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider } from '@coral-xyz/anchor'
import { getProgram } from '../lib/program'
import type { ZalaryProgram } from '../lib/program'

export function useProgram(): ZalaryProgram | null {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const { connected, publicKey, wallet: rawWallet } = useWallet()

  return useMemo(() => {
    if (!wallet) {
      // Diagnostic: distinguish "not connected" from "connected but no signer"
      if (connected && publicKey) {
        console.warn('[useProgram] useWallet says connected, but useAnchorWallet is undefined.', {
          walletName: rawWallet?.adapter?.name,
          hasSignTransaction: typeof (rawWallet?.adapter as any)?.signTransaction === 'function',
          hasSignAllTransactions: typeof (rawWallet?.adapter as any)?.signAllTransactions === 'function',
          publicKey: publicKey.toBase58(),
        })
      }
      return null
    }
    try {
      const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
      return getProgram(provider)
    } catch (err) {
      console.error('[useProgram] getProgram threw:', err)
      return null
    }
  }, [connection, wallet, connected, publicKey, rawWallet])
}
