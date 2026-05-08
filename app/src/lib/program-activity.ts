// Direct-RPC fetch of txs touching a wallet, filtered to Zalary's program.
// No third-party indexer in the loop — every byte of metadata stays between
// the user's browser and the Solana RPC they configured (Helius by default).
//
// The chain shows what it shows. No analytics provider accumulates a
// behavioural profile of who-asked-what-when on top of that.

import { PublicKey } from '@solana/web3.js'
import { connection } from './helius'
import { PROGRAM_ID } from './program'

export interface ProgramTx {
  signature: string
  blockTime: number  // unix seconds
  feePayer: string
  fee: number  // lamports
  success: boolean
}

interface RpcTxLike {
  transaction: { message: { staticAccountKeys?: PublicKey[] } }
  meta?: { fee?: number; err?: unknown } | null
}

export async function getProgramTxsForWallet(wallet: PublicKey, limit = 100): Promise<ProgramTx[]> {
  const sigs = await connection.getSignaturesForAddress(wallet, { limit })
  const detailed = await Promise.all(
    sigs.map(s => connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }))
  )
  const out: ProgramTx[] = []
  for (let i = 0; i < sigs.length; i++) {
    const tx = detailed[i] as RpcTxLike | null
    if (!tx) continue
    if (!txTouchesProgram(tx)) continue
    out.push({
      signature: sigs[i].signature,
      blockTime: sigs[i].blockTime ?? 0,
      feePayer: tx.transaction.message.staticAccountKeys?.[0]?.toBase58() ?? '',
      fee: tx.meta?.fee ?? 0,
      success: !tx.meta?.err,
    })
  }
  return out
}

function txTouchesProgram(tx: RpcTxLike): boolean {
  const keys = tx.transaction.message.staticAccountKeys ?? []
  return keys.some(k => k.equals(PROGRAM_ID))
}
