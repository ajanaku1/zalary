// Subscribe to Zalary program logs in real time. Each new tx triggers a
// callback with the signature, then enriches it via Helius Enhanced API to
// label the instruction. No polling — this is a push from the Helius WS.

import { useEffect, useRef, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { decodeZalaryInstructions, fetchEnhancedTransactions, subscribeProgramLogs } from '../lib/helius-enhanced'

export interface LiveTxEvent {
  signature: string
  instructions: string[]  // empty if Helius enhanced unavailable
  at: number
}

export function useHeliusLogStream(enabled = true): LiveTxEvent | null {
  const { connection } = useConnection()
  const [latest, setLatest] = useState<LiveTxEvent | null>(null)
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled) return
    const unsub = subscribeProgramLogs(connection, async (sig) => {
      if (seen.current.has(sig)) return
      seen.current.add(sig)
      let instructions: string[] = []
      try {
        const enhanced = await fetchEnhancedTransactions([sig])
        if (enhanced[0]) instructions = decodeZalaryInstructions(enhanced[0])
      } catch { /* enhancement is best-effort */ }
      setLatest({ signature: sig, instructions, at: Date.now() })
    })
    return unsub
  }, [connection, enabled])

  return latest
}
