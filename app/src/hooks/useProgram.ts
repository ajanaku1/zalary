import { useMemo } from 'react'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { AnchorProvider } from '@coral-xyz/anchor'
import { getProgram } from '../lib/program'
import type { ZalaryProgram } from '../lib/program'

export function useProgram(): ZalaryProgram | null {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()

  return useMemo(() => {
    if (!wallet) return null
    try {
      const provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
      })
      return getProgram(provider)
    } catch {
      return null
    }
  }, [connection, wallet])
}
