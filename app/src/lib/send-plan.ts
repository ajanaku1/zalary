// Execute Solana Kit InstructionPlans by converting leaves to web3.js txs
// and signing with wallet-adapter. Handles sequential / parallel / single plans.

import {
  AccountRole,
  type Instruction,
  type InstructionPlan,
} from '@solana/kit'
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Connection,
  type Keypair,
  type TransactionSignature,
} from '@solana/web3.js'
import { pollConfirm } from './program'

export type SendTransactionFn = (
  transaction: Transaction,
  connection: Connection,
  options?: { signers?: Keypair[] },
) => Promise<TransactionSignature>

function kitIxToWeb3(ix: Instruction): TransactionInstruction {
  const keys = (ix.accounts ?? []).map((meta) => {
    const role = meta.role as AccountRole
    return {
      pubkey: new PublicKey(meta.address),
      isSigner:
        role === AccountRole.READONLY_SIGNER || role === AccountRole.WRITABLE_SIGNER,
      isWritable:
        role === AccountRole.WRITABLE || role === AccountRole.WRITABLE_SIGNER,
    }
  })
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys,
    data: Buffer.from(ix.data ?? new Uint8Array()),
  })
}

/** Collect ordered atomic batches (non-divisible groups stay in one tx). */
export function planToBatches(plan: InstructionPlan): Instruction[][] {
  if ((plan as { kind?: string }).kind === 'single' || 'instruction' in plan) {
    const single = plan as { instruction: Instruction }
    return [[single.instruction]]
  }

  if ((plan as { kind?: string }).kind === 'sequential') {
    const seq = plan as {
      divisible: boolean
      plans: InstructionPlan[]
    }
    if (!seq.divisible) {
      // Non-divisible: flatten all nested instructions into one atomic batch.
      return [flattenAll(seq.plans)]
    }
    return seq.plans.flatMap((p) => planToBatches(p))
  }

  if ((plan as { kind?: string }).kind === 'parallel') {
    const par = plan as { plans: InstructionPlan[] }
    // Parallel plans can run as separate txs (or one combined batch if small).
    return par.plans.flatMap((p) => planToBatches(p))
  }

  // Message packer — treat as opaque sequential of packed singles if present
  if ((plan as { kind?: string }).kind === 'messagePacker') {
    throw new Error('Message-packer instruction plans are not supported in the wallet bridge')
  }

  throw new Error(`Unknown instruction plan kind: ${(plan as { kind?: string }).kind}`)
}

function flattenAll(plans: InstructionPlan[]): Instruction[] {
  const out: Instruction[] = []
  for (const p of plans) {
    for (const batch of planToBatches(p)) out.push(...batch)
  }
  return out
}

export async function sendInstruction(
  connection: Connection,
  feePayer: PublicKey,
  sendTransaction: SendTransactionFn,
  instruction: Instruction,
  extraSigners: Keypair[] = [],
): Promise<string> {
  return sendInstructionBatch(connection, feePayer, sendTransaction, [instruction], extraSigners)
}

export async function sendInstructionBatch(
  connection: Connection,
  feePayer: PublicKey,
  sendTransaction: SendTransactionFn,
  instructions: Instruction[],
  extraSigners: Keypair[] = [],
): Promise<string> {
  const tx = new Transaction()
  for (const ix of instructions) tx.add(kitIxToWeb3(ix))
  tx.feePayer = feePayer
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash

  if (extraSigners.length > 0) {
    tx.partialSign(...extraSigners)
  }

  const sig = await sendTransaction(tx, connection, { signers: extraSigners })
  try {
    await pollConfirm(connection, sig, 90_000)
  } catch {
    // Some RPCs drop WS; signature may still land.
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => {})
  }
  return sig
}

export async function sendInstructionPlan(
  connection: Connection,
  feePayer: PublicKey,
  sendTransaction: SendTransactionFn,
  plan: InstructionPlan,
  extraSigners: Keypair[] = [],
): Promise<string[]> {
  const batches = planToBatches(plan)
  const sigs: string[] = []
  for (const batch of batches) {
    if (batch.length === 0) continue
    // Keep batches under tx size limits (~8 ixs is usually safe for CT setup).
    const CHUNK = 6
    for (let i = 0; i < batch.length; i += CHUNK) {
      const chunk = batch.slice(i, i + CHUNK)
      const sig = await sendInstructionBatch(connection, feePayer, sendTransaction, chunk, extraSigners)
      sigs.push(sig)
    }
  }
  return sigs
}
