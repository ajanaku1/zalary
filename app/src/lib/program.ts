import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, type Transaction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { IDL } from './zalary_idl'

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

  // Run a real preflight simulation so program errors (insufficient funds, unauthorized,
  // PDA mismatch) surface before we burn fees and start polling.
  const sim = await connection.simulateTransaction(signed, { commitment: 'confirmed', sigVerify: false })
  if (sim.value.err) {
    const logs = sim.value.logs ?? []
    const programError = logs.find(l => l.includes('Error:') || l.includes('failed:'))
    throw new Error(programError || `Simulation failed: ${JSON.stringify(sim.value.err)}`)
  }

  // Preflight passed. Send with skipPreflight=true now (avoid double simulation on the RPC)
  // and rely on the polling loop below for confirmation.
  const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 5 })

  while (true) {
    const { value } = await connection.getSignatureStatuses([sig])
    const status = value[0]
    if (status?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return sig
    }
    const currentHeight = await connection.getBlockHeight('confirmed')
    if (currentHeight > lastValidBlockHeight) {
      throw new Error(`Transaction expired (blockhash no longer valid). Signature: ${sig}`)
    }
    try { await connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 }) } catch {}
    await new Promise(r => setTimeout(r, 2000))
  }
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
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()
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
