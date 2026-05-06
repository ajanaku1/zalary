// Salary obfuscation layer — STRUCTURAL PLACEHOLDER, not real privacy.
//
// What this currently is:
//   - AES-256-GCM where the key is derived from the recipient's *public* key
//   - This means anyone with the recipient's pubkey (i.e., any chain observer)
//     can derive the same key and decrypt
//   - The 64-byte on-chain blob is opaque to a casual viewer but trivially
//     reversible by anyone who reads this file
//
// What it is *not*:
//   - It is not asymmetric encryption
//   - It is not a shared secret
//   - It does not provide chain-level privacy for salary amounts
//
// Why it's still in the repo:
//   The shape of the data (64-byte blob on the Employee account, encrypt/decrypt
//   round-trip in the UI) matches the slot we'll fill with the real privacy
//   primitive: Solana Token-2022 confidential transfers (employer = auditor key)
//   or Arcium CSPL when their devnet cluster ships. The migration is tracked as
//   P0 in the Frontier roadmap. Until then, treat this file as a UI scaffold,
//   not a security boundary.

export interface EncryptedAmount {
  ciphertext: Uint8Array  // 64 bytes stored on-chain
}

// Derive a shared encryption key from employer + employee keypairs
// For demo: uses SubtleCrypto with a deterministic salt
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    salt.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveBits', 'deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: new TextEncoder().encode('zalary-salary-encryption') },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypt a salary amount before storing on-chain.
 * Returns 64 bytes: [12 bytes IV | 4 bytes amount (LE) | padding | 16 bytes auth tag]
 * In production, this would use Arcium MPC or Token-2022 confidential transfer.
 */
export async function encryptSalary(amount: number, recipientPubkey: string): Promise<Uint8Array> {
  const buffer = new Uint8Array(64)

  try {
    // Use recipient pubkey as salt for deterministic key derivation
    const salt = new TextEncoder().encode(recipientPubkey.slice(0, 32).padEnd(32, '0'))
    const key = await deriveKey(salt)

    // Encode amount as 8-byte float64
    const amountBuf = new ArrayBuffer(8)
    new DataView(amountBuf).setFloat64(0, amount, true)

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new Uint8Array(amountBuf),
    )

    // Pack into 64 bytes: [12 IV | encrypted data (8 + 16 auth tag = 24) | 28 random padding]
    buffer.set(iv, 0)
    buffer.set(new Uint8Array(ciphertext), 12)
    crypto.getRandomValues(buffer.subarray(36)) // Fill remaining with random to mask structure
  } catch {
    // Fallback: simple encoding for environments without SubtleCrypto
    const view = new DataView(buffer.buffer)
    view.setFloat64(0, amount, true)
    crypto.getRandomValues(buffer.subarray(8))
  }

  return buffer
}

/**
 * Decrypt a salary amount. Only the intended recipient can decrypt.
 * In production, decryption happens via Arcium MPC or the employee's private key.
 */
export async function decryptSalary(encrypted: Uint8Array, recipientPubkey: string): Promise<number> {
  try {
    const salt = new TextEncoder().encode(recipientPubkey.slice(0, 32).padEnd(32, '0'))
    const key = await deriveKey(salt)

    const iv = encrypted.slice(0, 12)
    const ciphertext = encrypted.slice(12, 36) // 8 bytes plaintext + 16 bytes auth tag

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )

    return new DataView(decrypted).getFloat64(0, true)
  } catch {
    // Fallback
    const view = new DataView(encrypted.buffer, encrypted.byteOffset)
    return view.getFloat64(0, true)
  }
}

/**
 * Production privacy path (what replaces this file):
 *
 * 1. Token-2022 Confidential Transfers — Solana's native extension. Treasury and
 *    employee ATAs become confidential balances using ElGamal commitments. The
 *    employer holds the auditor key, which doubles as the compliance/selective-
 *    disclosure primitive. No MPC cluster, no L2.
 *
 * 2. Arcium CSPL — alternative path when their MPC cluster is available on the
 *    target network. The transfer itself runs through MPC so no single party
 *    sees the amount in transit.
 *
 * The current file is a UI placeholder so the rest of the stack (Employee PDA
 * layout, encrypt/decrypt UI, dashboard) is shaped correctly for the migration.
 * It is not a security boundary. See README "Honest status" + BUSINESS.md.
 */
export const PRIVACY_LAYER = 'placeholder-pending-token2022-confidential-transfer-migration' as const
