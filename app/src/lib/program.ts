import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, type Connection, type Transaction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token'
import { IDL } from './zalary_idl'

// Poll signature status manually instead of using connection.confirmTransaction,
// which relies on a WebSocket signatureSubscribe that some RPCs (Helius free tier,
// public devnet) drop silently — leading to 30s/120s legacy timeouts.
export async function pollConfirm(connection: Connection, sig: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([sig])
    const status = value[0]
    if (status?.err) throw new Error(`On-chain failure: ${JSON.stringify(status.err)} (sig: ${sig})`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`Confirmation timed out after ${timeoutMs / 1000}s. Signature: ${sig}`)
}

export const PROGRAM_ID = new PublicKey('FGBieAeHERm7CJxtXsicQ7NaQ4FqsDixSwmMqKhovfpH')

export type ZalaryProgram = Program<any>

export function getProgram(provider: AnchorProvider): ZalaryProgram {
  return new Program(IDL as any, provider) as unknown as ZalaryProgram
}

// Polls getSignatureStatuses + block height instead of relying on WebSocket subscription.
// Some RPCs (Helius free tier, public devnet) drop signatureSubscribe silently, causing
// confirmTransaction to hang until its internal timeout regardless of config.
async function sendTx(program: ZalaryProgram, tx: Transaction): Promise<string> {
  const provider = program.provider as AnchorProvider
  const connection = provider.connection
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash
  tx.feePayer = provider.publicKey!
  const signed = await provider.wallet.signTransaction(tx)
  const rawTx = signed.serialize()

  // Send WITH preflight — the RPC runs simulation server-side and returns a clean
  // SendTransactionError with logs before we ever poll. This is what surfaces
  // program errors (insufficient funds, unauthorized, PDA mismatch).
  let sig: string
  try {
    sig = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 5,
    })
  } catch (err: any) {
    const logs = err?.logs?.join('\n') || ''
    const programError = logs.match(/Program log: Error:.*$/m)?.[0] || err?.message || 'Send failed'
    throw new Error(programError)
  }

  console.log('Tx sent, polling for confirmation:', sig)

  // Poll status. Cap at 90s — devnet block-height can be slow to advance and
  // we want to surface the signature to the user rather than spin silently.
  const maxAttempts = 45
  for (let i = 0; i < maxAttempts; i++) {
    const { value } = await connection.getSignatureStatuses([sig])
    const status = value[0]
    if (status?.err) throw new Error(`On-chain failure: ${JSON.stringify(status.err)} (sig: ${sig})`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return sig
    }
    try {
      const currentHeight = await connection.getBlockHeight('confirmed')
      if (currentHeight > lastValidBlockHeight) {
        throw new Error(`Blockhash expired before confirmation. Signature: ${sig}`)
      }
    } catch { /* getBlockHeight is best-effort, ignore */ }
    // Re-broadcast once in a while in case the leader dropped it.
    if (i % 5 === 4) {
      try { await connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 }) } catch {}
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`Confirmation timed out after 90s. Check signature on Solscan: ${sig}`)
}

// ── PDA helpers ──────────────────────────────────────────────────────

export function findOrganizationPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('org'), authority.toBuffer()],
    PROGRAM_ID,
  )
}

export function findTreasuryPda(organizationPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), organizationPda.toBuffer()],
    PROGRAM_ID,
  )
}

export function findEmployeePda(organizationPda: PublicKey, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('employee'), organizationPda.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID,
  )
}

export function findPayrollRunPda(organizationPda: PublicKey, payrollCount: number): [PublicKey, number] {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(payrollCount)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('payroll'), organizationPda.toBuffer(), buf],
    PROGRAM_ID,
  )
}

export function findPausePda(organizationPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pause'), organizationPda.toBuffer()],
    PROGRAM_ID,
  )
}

// ── Instruction helpers ─────────────────────────────────────────────

export async function createOrganization(
  program: ZalaryProgram,
  name: string,
  usdcMint: PublicKey,
) {
  const authority = program.provider.publicKey!
  const [organizationPda] = findOrganizationPda(authority)
  const [treasuryPda] = findTreasuryPda(organizationPda)

  const tx = await (program.methods as any)
    .createOrganization(name)
    .accounts({
      organization: organizationPda,
      treasury: treasuryPda,
      usdcMint,
      authority,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction()
  const sig = await sendTx(program, tx)
  return { tx: sig, organizationPda, treasuryPda }
}

export async function addEmployee(
  program: ZalaryProgram,
  orgPda: PublicKey,
  employeeWallet: PublicKey,
  encryptedSalary: number[],
) {
  const authority = program.provider.publicKey!
  const [employeePda] = findEmployeePda(orgPda, employeeWallet)

  const tx = await (program.methods as any)
    .addEmployee(employeeWallet, encryptedSalary)
    .accounts({
      organization: orgPda,
      employee: employeePda,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .transaction()
  const sig = await sendTx(program, tx)
  return { tx: sig, employeePda }
}

export async function fundTreasury(
  program: ZalaryProgram,
  orgPda: PublicKey,
  amount: number,
  signerTokenAccount: PublicKey,
  usdcMint: PublicKey,
) {
  const funder = program.provider.publicKey!
  const [treasuryPda] = findTreasuryPda(orgPda)
  const connection = (program.provider as AnchorProvider).connection

  // If the funder's USDC ATA doesn't exist yet, create it in the same tx so the
  // FundTreasury instruction has something to spend from. Idempotent — no-op if
  // the account is already there. Will not magically give the user USDC, but it
  // turns "AccountNotInitialized" into a clean "insufficient funds" if they
  // genuinely have no balance.
  const ataInfo = await connection.getAccountInfo(signerTokenAccount)

  const tx = await (program.methods as any)
    .fundTreasury(new BN(amount))
    .accounts({
      organization: orgPda,
      treasury: treasuryPda,
      funderTokenAccount: signerTokenAccount,
      usdcMint,
      funder,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()

  if (!ataInfo) {
    tx.instructions.unshift(
      createAssociatedTokenAccountIdempotentInstruction(funder, signerTokenAccount, funder, usdcMint),
    )
  }

  return { tx: await sendTx(program, tx) }
}

export async function runPayroll(
  program: ZalaryProgram,
  orgPda: PublicKey,
  employeeWallet: PublicKey,
  employeeTokenAccount: PublicKey,
  usdcMint: PublicKey,
  amount: number,
  payrollCount: number,
) {
  const authority = program.provider.publicKey!
  const [treasuryPda] = findTreasuryPda(orgPda)
  const [employeePda] = findEmployeePda(orgPda, employeeWallet)
  const [payrollRunPda] = findPayrollRunPda(orgPda, payrollCount)
  const [pausePda] = findPausePda(orgPda)
  const connection = (program.provider as AnchorProvider).connection

  const ataInfo = await connection.getAccountInfo(employeeTokenAccount)

  const tx = await (program.methods as any)
    .runPayroll(new BN(amount))
    .accounts({
      organization: orgPda,
      treasury: treasuryPda,
      employee: employeePda,
      employeeTokenAccount,
      payrollRun: payrollRunPda,
      usdcMint,
      authority,
      pauseCheck: pausePda,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()

  // If the employee's USDC ATA doesn't exist yet, create it first so RunPayroll
  // has a valid destination. The employer (authority) pays the rent.
  if (!ataInfo) {
    tx.instructions.unshift(
      createAssociatedTokenAccountIdempotentInstruction(authority, employeeTokenAccount, employeeWallet, usdcMint),
    )
  }

  return { tx: await sendTx(program, tx), payrollRunPda }
}

export async function verifyWorldId(
  program: ZalaryProgram,
  orgPda: PublicKey,
  nullifierHash: number[],
) {
  const claimer = program.provider.publicKey!
  const [employeePda] = findEmployeePda(orgPda, claimer)

  const tx = await (program.methods as any)
    .verifyWorldId(nullifierHash)
    .accounts({
      organization: orgPda,
      employee: employeePda,
      claimer,
    })
    .transaction()
  return { tx: await sendTx(program, tx) }
}

export async function pauseOrganization(program: ZalaryProgram, orgPda: PublicKey) {
  const authority = program.provider.publicKey!
  const [pausePda] = findPausePda(orgPda)
  const tx = await (program.methods as any)
    .pauseOrganization()
    .accounts({
      organization: orgPda,
      pause: pausePda,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .transaction()
  return { tx: await sendTx(program, tx) }
}

export async function resumeOrganization(program: ZalaryProgram, orgPda: PublicKey) {
  const authority = program.provider.publicKey!
  const [pausePda] = findPausePda(orgPda)
  const tx = await (program.methods as any)
    .resumeOrganization()
    .accounts({
      organization: orgPda,
      pause: pausePda,
      authority,
    })
    .transaction()
  return { tx: await sendTx(program, tx) }
}

export async function isOrganizationPaused(program: ZalaryProgram, orgPda: PublicKey): Promise<boolean> {
  const [pausePda] = findPausePda(orgPda)
  const info = await (program.provider as AnchorProvider).connection.getAccountInfo(pausePda)
  return !!info && info.lamports > 0
}

export async function closeOrganization(
  program: ZalaryProgram,
  orgPda: PublicKey,
) {
  const authority = program.provider.publicKey!
  const [treasuryPda] = findTreasuryPda(orgPda)

  const tx = await (program.methods as any)
    .closeOrganization()
    .accounts({
      organization: orgPda,
      treasury: treasuryPda,
      authority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()
  return { tx: await sendTx(program, tx) }
}

export async function withdrawTreasury(
  program: ZalaryProgram,
  orgPda: PublicKey,
  authorityTokenAccount: PublicKey,
  usdcMint: PublicKey,
  amount: number,
) {
  const authority = program.provider.publicKey!
  const [treasuryPda] = findTreasuryPda(orgPda)

  const tx = await (program.methods as any)
    .withdrawTreasury(new BN(amount))
    .accounts({
      organization: orgPda,
      treasury: treasuryPda,
      authorityTokenAccount,
      usdcMint,
      authority,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()
  return { tx: await sendTx(program, tx) }
}

export async function updateSalary(
  program: ZalaryProgram,
  orgPda: PublicKey,
  employeeWallet: PublicKey,
  newEncryptedSalary: number[],
) {
  const authority = program.provider.publicKey!
  const [employeePda] = findEmployeePda(orgPda, employeeWallet)

  const tx = await (program.methods as any)
    .updateSalary(newEncryptedSalary)
    .accounts({
      organization: orgPda,
      employee: employeePda,
      authority,
    })
    .transaction()
  return { tx: await sendTx(program, tx) }
}

export async function claimFunds(
  program: ZalaryProgram,
  orgPda: PublicKey,
  escrowTokenAccount: PublicKey,
  claimerTokenAccount: PublicKey,
  usdcMint: PublicKey,
  amount: number,
) {
  const claimer = program.provider.publicKey!
  const [employeePda] = findEmployeePda(orgPda, claimer)

  const tx = await (program.methods as any)
    .claimFunds(new BN(amount))
    .accounts({
      organization: orgPda,
      employee: employeePda,
      escrowTokenAccount,
      claimerTokenAccount,
      usdcMint,
      claimer,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()
  return { tx: await sendTx(program, tx) }
}
