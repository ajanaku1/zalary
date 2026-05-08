// Seed Zalary's devnet program with a populated org so every demo screen
// (Insights cadence, Activity log, team grid, payroll review) has something
// real to render.
//
// Usage:
//   KEYPAIR_PATH=~/.config/solana/id.json \
//   RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY \
//   ORG_NAME="Acme Remote" \
//   npm run seed-devnet
//
// Idempotent: each step checks on-chain state first and skips if already done.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import {
  getProgram,
  findOrganizationPda,
  findEmployeePda,
  findTreasuryPda,
  createOrganization,
  addEmployee,
  updateSalary,
  fundTreasury,
  runPayroll,
} from '../src/lib/program'
import { encryptSalary } from '../src/lib/salary_crypto'

const USDC_MINT = new PublicKey('AY6ZDfcEqzRKmjk4SJ6s5WUtozYGmgBmHds8M5JhxmnD')
const DEFAULT_RPC = 'https://api.devnet.solana.com'
const DEFAULT_ORG_NAME = 'Acme Remote'
const FUND_AMOUNT_USDC = 5_000  // 5,000 USDC, fits inside a typical devnet balance
const PAYROLL_RUN_COUNT = 3

interface SeedEmployee {
  name: string
  salary: number  // ui USDC
}

const EMPLOYEES: SeedEmployee[] = [
  { name: 'Lagos Engineer',    salary: 4200 },
  { name: 'Berlin Designer',   salary: 5100 },
  { name: 'Buenos Aires Dev',  salary: 3800 },
  { name: 'Ho Chi Minh PM',    salary: 4500 },
  { name: 'Manila Support',    salary: 2300 },
  { name: 'Nairobi Marketing', salary: 3100 },
]

async function main(): Promise<void> {
  const { connection, wallet, provider } = buildProvider()
  const program = getProgram(provider)
  const authority = wallet.publicKey

  await assertFunded(connection, authority)

  const orgPda = await ensureOrganization(program)
  const employees = await seedEmployees(program, orgPda)
  await maybeFundTreasury(program, orgPda, authority)
  await runPayrollCycles(program, orgPda, employees)

  printSummary(orgPda, employees)
}

function buildProvider(): { connection: Connection; wallet: Wallet; provider: AnchorProvider } {
  const keypairPath = process.env.KEYPAIR_PATH ?? `${homedir()}/.config/solana/id.json`
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC
  const secret = JSON.parse(readFileSync(resolve(keypairPath.replace(/^~/, homedir())), 'utf8'))
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret))
  const connection = new Connection(rpcUrl, 'confirmed')
  const wallet = new Wallet(keypair)
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  return { connection, wallet, provider }
}

async function assertFunded(connection: Connection, authority: PublicKey): Promise<void> {
  const balance = await connection.getBalance(authority)
  const minSol = 0.5 * LAMPORTS_PER_SOL
  if (balance < minSol) {
    throw new Error(
      `Authority ${authority.toBase58()} has ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL. ` +
      `Fund it with at least 0.5 SOL via solana airdrop or a faucet first.`,
    )
  }
}

async function ensureOrganization(program: ReturnType<typeof getProgram>): Promise<PublicKey> {
  const authority = program.provider.publicKey!
  const [orgPda] = findOrganizationPda(authority)
  const existing = await (program.account as any).organization.fetchNullable(orgPda)
  if (existing) {
    log('org', `exists at ${orgPda.toBase58()}, skipping create`)
    return orgPda
  }
  const orgName = process.env.ORG_NAME ?? DEFAULT_ORG_NAME
  log('org', `creating "${orgName}" at ${orgPda.toBase58()}`)
  await createOrganization(program, orgName, USDC_MINT)
  return orgPda
}

interface SeededEmployee extends SeedEmployee {
  keypair: Keypair
  pda: PublicKey
}

async function seedEmployees(
  program: ReturnType<typeof getProgram>,
  orgPda: PublicKey,
): Promise<SeededEmployee[]> {
  const out: SeededEmployee[] = []
  for (let i = 0; i < EMPLOYEES.length; i++) {
    const seed = EMPLOYEES[i]
    const keypair = deterministicEmployee(orgPda, i)
    const [pda] = findEmployeePda(orgPda, keypair.publicKey)
    const existing = await (program.account as any).employee.fetchNullable(pda)
    if (existing) {
      log('employee', `${seed.name} exists at ${pda.toBase58()}, skipping`)
    } else {
      log('employee', `adding ${seed.name} (${keypair.publicKey.toBase58()})`)
      await addEmployee(program, orgPda, keypair.publicKey, Array(64).fill(0))
      const encrypted = await encryptSalary(seed.salary, keypair.publicKey.toBase58())
      await updateSalary(program, orgPda, keypair.publicKey, Array.from(encrypted))
    }
    out.push({ ...seed, keypair, pda })
  }
  return out
}

// Deterministic employee keypair so re-running the seed picks up the same on-
// chain accounts. Derived from the org PDA + index, so different orgs don't
// collide and the script stays reproducible.
function deterministicEmployee(orgPda: PublicKey, index: number): Keypair {
  const seed = new Uint8Array(32)
  const orgBytes = orgPda.toBytes()
  for (let i = 0; i < 31; i++) seed[i] = orgBytes[i]
  seed[31] = index
  return Keypair.fromSeed(seed)
}

async function maybeFundTreasury(
  program: ReturnType<typeof getProgram>,
  orgPda: PublicKey,
  authority: PublicKey,
): Promise<void> {
  const [treasuryPda] = findTreasuryPda(orgPda)
  const balance = await fetchTokenBalance(program.provider.connection, treasuryPda)
  if (balance >= FUND_AMOUNT_USDC) {
    log('treasury', `already holds ${balance} USDC, skipping fund`)
    return
  }
  const funderAta = getAssociatedTokenAddressSync(USDC_MINT, authority, false, TOKEN_2022_PROGRAM_ID)
  const funderBalance = await fetchTokenBalance(program.provider.connection, funderAta)
  if (funderBalance < FUND_AMOUNT_USDC) {
    log('treasury', `funder holds ${funderBalance} USDC, need ${FUND_AMOUNT_USDC}; mint test USDC then re-run`)
    return
  }
  log('treasury', `funding ${FUND_AMOUNT_USDC} USDC`)
  await fundTreasury(program, orgPda, FUND_AMOUNT_USDC * 1_000_000, funderAta, USDC_MINT)
}

async function fetchTokenBalance(connection: Connection, ata: PublicKey): Promise<number> {
  try {
    const res = await connection.getTokenAccountBalance(ata)
    return Number(res.value.uiAmountString ?? 0)
  } catch {
    return 0
  }
}

async function runPayrollCycles(
  program: ReturnType<typeof getProgram>,
  orgPda: PublicKey,
  employees: SeededEmployee[],
): Promise<void> {
  const orgAccount = await (program.account as any).organization.fetch(orgPda)
  let payrollCount = Number(orgAccount.payrollCount)
  const createdAt = BigInt(orgAccount.createdAt.toString())

  for (let cycle = 0; cycle < PAYROLL_RUN_COUNT; cycle++) {
    log('payroll', `cycle ${cycle + 1}/${PAYROLL_RUN_COUNT}, payrollCount=${payrollCount}`)
    for (const emp of employees) {
      const ata = getAssociatedTokenAddressSync(USDC_MINT, emp.keypair.publicKey, false, TOKEN_2022_PROGRAM_ID)
      try {
        await runPayroll(
          program, orgPda, emp.keypair.publicKey, ata, USDC_MINT,
          Math.round(emp.salary * 1_000_000), payrollCount, createdAt,
        )
        payrollCount++
      } catch (err) {
        log('payroll', `skipped ${emp.name}: ${(err as Error).message.slice(0, 120)}`)
      }
    }
  }
}

function printSummary(orgPda: PublicKey, employees: SeededEmployee[]): void {
  log('done', `org PDA ${orgPda.toBase58()}`)
  log('done', `${employees.length} employees seeded`)
  for (const e of employees) {
    log('done', `  ${e.name.padEnd(22)} $${String(e.salary).padStart(5)}  ${e.keypair.publicKey.toBase58()}`)
  }
  log('done', 'Visit the Insights tab — cadence, funders, fees should all populate.')
}

function log(stage: string, msg: string): void {
  console.log(`[${stage}] ${msg}`)
}

main().catch(err => {
  console.error('seed-devnet failed:', err)
  process.exit(1)
})
