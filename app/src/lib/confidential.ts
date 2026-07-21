// Token-2022 Confidential Transfer layer for Zalary payroll.
// Replaces the Umbra/Arcium path. Amounts are ElGamal-encrypted on-chain;
// recipients remain visible (native CT property). Auditor ElGamal key on the mint.

import {
  createSolanaRpc,
  some,
  unwrapOption,
  type Address,
  type Instruction,
  type Rpc,
} from '@solana/kit'
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
  getConfidentialDepositInstruction,
  getCreateMintInstructionPlan,
  getMintToInstruction,
  getUpdateConfidentialTransferMintInstruction,
} from '@solana-program/token-2022'
import {
  deriveAeKeyForOwnerMint,
  deriveElGamalKeypairForOwnerMint,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from '@solana-program/token-2022/confidential'
import {
  AeCiphertext,
  AeKey,
  ElGamalKeypair,
  ElGamalSecretKey,
} from '@solana/zk-sdk/bundler'
import {
  Keypair,
  PublicKey,
  type Connection,
  type Transaction,
  type TransactionSignature,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import { asAddress, createAddressSigner, createMessageSignerFromWallet, type WalletSignMessage } from './kit-wallet'
import { sendInstruction, sendInstructionPlan, type SendTransactionFn } from './send-plan'
import { getEnv } from './env'

export const CT_DECIMALS = 6
export const CT_SYMBOL = 'cUSDC'
export const PRIVACY_LAYER = 'token-2022-confidential-transfer' as const

const MINT_STORAGE_PREFIX = 'zalary.ct.mint.'

export function getRpcUrl(): string {
  const helius = getEnv('VITE_HELIUS_RPC_URL')
  if (helius?.startsWith('http')) return helius
  return 'https://api.devnet.solana.com'
}

export function createCtRpc(): Rpc<any> {
  return createSolanaRpc(getRpcUrl())
}

export function mintStorageKey(wallet: string): string {
  return `${MINT_STORAGE_PREFIX}${wallet}`
}

export function loadStoredMint(wallet: string): string | null {
  try {
    return localStorage.getItem(mintStorageKey(wallet))
  } catch {
    return null
  }
}

export function storeMint(wallet: string, mint: string): void {
  try {
    localStorage.setItem(mintStorageKey(wallet), mint)
  } catch { /* ignore */ }
}

export function clearStoredMint(wallet: string): void {
  try {
    localStorage.removeItem(mintStorageKey(wallet))
  } catch { /* ignore */ }
}

export interface ConfidentialKeys {
  elgamalKeypair: ElGamalKeypair
  elgamalSecretKey: ElGamalSecretKey
  elgamalPubkey: Address
  aesKey: AeKey
}

export async function deriveConfidentialKeys(
  owner: PublicKey,
  mint: string,
  signMessage: WalletSignMessage,
): Promise<ConfidentialKeys> {
  const signer = createMessageSignerFromWallet(owner, signMessage)
  const ownerAddr = asAddress(owner)
  const mintAddr = asAddress(mint)

  const derived = await deriveElGamalKeypairForOwnerMint({
    signer,
    owner: ownerAddr,
    mint: mintAddr,
  })
  const elgamalSecretKey = ElGamalSecretKey.fromBytes(derived.secretKey)
  const elgamalKeypair = ElGamalKeypair.fromSecretKey(elgamalSecretKey)
  const aesKey = AeKey.fromBytes(
    await deriveAeKeyForOwnerMint({
      signer,
      owner: ownerAddr,
      mint: mintAddr,
    }),
  )

  return {
    elgamalKeypair,
    elgamalSecretKey,
    elgamalPubkey: derived.elgamalPubkey,
    aesKey,
  }
}

export async function findTokenAta(owner: PublicKey | string, mint: string): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({
    owner: asAddress(owner),
    mint: asAddress(mint),
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  })
  return ata
}

export function findTokenAtaSync(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID)
}

export async function createConfidentialMint(params: {
  connection: Connection
  owner: PublicKey
  signMessage: WalletSignMessage
  sendTransaction: SendTransactionFn
}): Promise<{ mint: string; signatures: string[] }> {
  const { connection, owner, signMessage, sendTransaction } = params
  // Kit's generateKeyPairSigner uses non-extractable CryptoKeys, so we co-sign
  // with a web3.js Keypair instead (partialSign + wallet fee-payer).
  const mintKeypair = Keypair.generate()
  const payer = createAddressSigner(owner)
  const mintAddr = asAddress(mintKeypair.publicKey)
  const newMintSigner = {
    address: mintAddr,
    async signTransactions() {
      throw new Error('Mint co-signs via web3 Keypair extraSigners')
    },
  } as any

  const auditor = await deriveElGamalKeypairForOwnerMint({
    signer: createMessageSignerFromWallet(owner, signMessage),
    owner: asAddress(owner),
    mint: mintAddr,
  })

  const plan = getCreateMintInstructionPlan({
    payer,
    newMint: newMintSigner,
    decimals: CT_DECIMALS,
    mintAuthority: payer,
    extensions: [
      {
        __kind: 'ConfidentialTransferMint',
        authority: some(asAddress(owner)),
        autoApproveNewAccounts: true,
        auditorElgamalPubkey: some(auditor.elgamalPubkey),
      },
    ],
  })

  const sigs = await sendInstructionPlan(connection, owner, sendTransaction, plan, [mintKeypair])
  const mint = mintKeypair.publicKey.toBase58()
  storeMint(owner.toBase58(), mint)
  try {
    localStorage.setItem('zalary.ct.shared_mint', mint)
  } catch { /* ignore */ }
  return { mint, signatures: sigs }
}

export async function ensureConfidentialTokenAccount(params: {
  connection: Connection
  owner: PublicKey
  mint: string
  keys: ConfidentialKeys
  sendTransaction: SendTransactionFn
}): Promise<{ token: Address; signatures: string[] }> {
  const { connection, owner, mint, keys, sendTransaction } = params
  const rpc = createCtRpc()
  const token = await findTokenAta(owner, mint)

  // Already configured?
  try {
    const acc = await fetchToken(rpc, token)
    const exts = unwrapOption(acc.data.extensions) ?? []
    if (exts.some((e: any) => e.__kind === 'ConfidentialTransferAccount')) {
      return { token, signatures: [] }
    }
  } catch {
    // Account missing — create below.
  }

  const plan = await getCreateConfidentialTransferAccountInstructionPlan({
    rpc: rpc as any,
    payer: createAddressSigner(owner),
    owner: createAddressSigner(owner),
    mint: asAddress(mint),
    token,
    elgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
  })

  const signatures = await sendInstructionPlan(connection, owner, sendTransaction, plan)
  return { token, signatures }
}

export async function mintDemoTokens(params: {
  connection: Connection
  owner: PublicKey
  mint: string
  amountUi: number
  sendTransaction: SendTransactionFn
}): Promise<string> {
  const { connection, owner, mint, amountUi, sendTransaction } = params
  const token = await findTokenAta(owner, mint)
  const amount = BigInt(Math.round(amountUi * 10 ** CT_DECIMALS))
  const ix = getMintToInstruction({
    mint: asAddress(mint),
    token,
    mintAuthority: createAddressSigner(owner),
    amount,
  })
  return sendInstruction(connection, owner, sendTransaction, ix as Instruction)
}

export async function depositToConfidential(params: {
  connection: Connection
  owner: PublicKey
  mint: string
  amountUi: number
  sendTransaction: SendTransactionFn
}): Promise<string> {
  const { connection, owner, mint, amountUi, sendTransaction } = params
  const token = await findTokenAta(owner, mint)
  const amount = BigInt(Math.round(amountUi * 10 ** CT_DECIMALS))
  const ix = getConfidentialDepositInstruction({
    token,
    mint: asAddress(mint),
    authority: createAddressSigner(owner),
    amount,
    decimals: CT_DECIMALS,
  })
  return sendInstruction(connection, owner, sendTransaction, ix as Instruction)
}

export async function applyPendingBalance(params: {
  connection: Connection
  owner: PublicKey
  mint: string
  keys: ConfidentialKeys
  sendTransaction: SendTransactionFn
}): Promise<string> {
  const { connection, owner, mint, keys, sendTransaction } = params
  const rpc = createCtRpc()
  const token = await findTokenAta(owner, mint)
  const tokenAccount = await fetchToken(rpc, token)
  const ix = getApplyConfidentialPendingBalanceInstructionFromToken({
    token,
    tokenAccount: tokenAccount.data,
    authority: createAddressSigner(owner),
    elgamalSecretKey: keys.elgamalSecretKey,
    aesKey: keys.aesKey,
  })
  return sendInstruction(connection, owner, sendTransaction, ix as Instruction)
}

export async function confidentialPayrollTransfer(params: {
  connection: Connection
  owner: PublicKey
  mint: string
  destinationOwner: string
  amountUi: number
  keys: ConfidentialKeys
  sendTransaction: SendTransactionFn
}): Promise<string[]> {
  const { connection, owner, mint, destinationOwner, amountUi, keys, sendTransaction } = params
  const rpc = createCtRpc()
  const amount = BigInt(Math.round(amountUi * 10 ** CT_DECIMALS))
  const sourceToken = await findTokenAta(owner, mint)
  const destinationToken = await findTokenAta(destinationOwner, mint)

  const sourceTokenAccount = (await fetchToken(rpc, sourceToken)).data
  let destinationTokenAccount: any
  try {
    destinationTokenAccount = (await fetchToken(rpc, destinationToken)).data
  } catch {
    throw new Error(
      `Recipient ${destinationOwner.slice(0, 4)}… has no confidential token account yet. They must open Zalary once to configure Token-2022 CT.`,
    )
  }

  const auditorElgamalPubkey = await getAuditorElgamalPubkey(mint)

  const plan = await getConfidentialTransferInstructionPlan({
    rpc: rpc as any,
    payer: createAddressSigner(owner),
    authority: createAddressSigner(owner),
    mint: asAddress(mint),
    sourceToken,
    sourceTokenAccount,
    destinationToken,
    destinationTokenAccount,
    auditorElgamalPubkey,
    amount,
    sourceElgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
  })

  return sendInstructionPlan(connection, owner, sendTransaction, plan)
}

export async function withdrawFromConfidential(params: {
  connection: Connection
  owner: PublicKey
  mint: string
  amountUi: number
  keys: ConfidentialKeys
  sendTransaction: SendTransactionFn
}): Promise<string[]> {
  const { connection, owner, mint, amountUi, keys, sendTransaction } = params
  const rpc = createCtRpc()
  const token = await findTokenAta(owner, mint)
  const tokenAccount = (await fetchToken(rpc, token)).data
  const amount = BigInt(Math.round(amountUi * 10 ** CT_DECIMALS))

  const plan = await getConfidentialWithdrawInstructionPlan({
    rpc: rpc as any,
    payer: createAddressSigner(owner),
    token,
    mint: asAddress(mint),
    tokenAccount,
    authority: createAddressSigner(owner),
    amount,
    decimals: CT_DECIMALS,
    elgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
  })

  return sendInstructionPlan(connection, owner, sendTransaction, plan)
}

export async function getAuditorElgamalPubkey(mint: string): Promise<Address | undefined> {
  const rpc = createCtRpc()
  try {
    const mintAccount = (await fetchMint(rpc, asAddress(mint))).data
    const exts = unwrapOption(mintAccount.extensions) ?? []
    const ct = exts.find((e: any) => e.__kind === 'ConfidentialTransferMint') as any
    if (!ct) return undefined
    const auditor = unwrapOption(ct.auditorElgamalPubkey) as Address | null | undefined
    return auditor || undefined
  } catch {
    return undefined
  }
}

/** Decrypt available confidential balance (owner only). */
export async function readAvailableBalance(
  mint: string,
  owner: PublicKey,
  keys: ConfidentialKeys,
): Promise<bigint | null> {
  const rpc = createCtRpc()
  try {
    const token = await findTokenAta(owner, mint)
    const tokenAccount = (await fetchToken(rpc, token)).data
    const exts = unwrapOption(tokenAccount.extensions) ?? []
    const ct = exts.find((e: any) => e.__kind === 'ConfidentialTransferAccount') as any
    if (!ct) return null
    const bytes = ct.decryptableAvailableBalance
    if (!bytes) return 0n
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes))
    const cipher = AeCiphertext.fromBytes(arr)
    if (!cipher) return null
    return keys.aesKey.decrypt(cipher)
  } catch {
    return null
  }
}

export async function readPublicBalance(
  connection: Connection,
  owner: PublicKey,
  mint: string,
): Promise<bigint> {
  try {
    const ata = findTokenAtaSync(owner, new PublicKey(mint))
    const bal = await connection.getTokenAccountBalance(ata, 'confirmed')
    return BigInt(bal.value.amount)
  } catch {
    return 0n
  }
}

export function formatAmount(raw: bigint, decimals = CT_DECIMALS): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toLocaleString()}${fracStr ? `.${fracStr}` : ''}`
}

/**
 * Set / clear mint auditor ElGamal pubkey (compliance selective disclosure).
 * Auditor must have opened Zalary once so we can derive their (owner, mint) ElGamal pubkey
 * only if they sign — here the employer sets their *own* auditor keypair address for demo,
 * or stores an auditor ElGamal pubkey the auditor shared.
 */
export async function updateMintAuditor(params: {
  connection: Connection
  owner: PublicKey
  mint: string
  auditorElgamalPubkey: string | null
  sendTransaction: SendTransactionFn
}): Promise<string> {
  const { connection, owner, mint, auditorElgamalPubkey, sendTransaction } = params
  const ix = getUpdateConfidentialTransferMintInstruction({
    mint: asAddress(mint),
    authority: createAddressSigner(owner),
    autoApproveNewAccounts: true,
    auditorElgamalPubkey: auditorElgamalPubkey
      ? some(asAddress(auditorElgamalPubkey))
      : null,
  } as any)
  return sendInstruction(connection, owner, sendTransaction, ix as Instruction)
}

export type { SendTransactionFn, Transaction, TransactionSignature }
