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
//   primitive: Solana Token-2022 confidential transfers (employer = auditor key).
//   Until that ZK-proven transfer path is wired, treat this file as a UI
//   scaffold, not a security boundary.

export interface EncryptedAmount {
  ciphertext: Uint8Array  // 64 bytes stored on-chain
}

// Derive a deterministic key from the recipient pubkey via HKDF.
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
 * Returns 64 bytes: [12 bytes IV | 24 bytes encrypted payload | 28 bytes random padding]
 * Replaced by Token-2022 ConfidentialTransfer (ElGamal-encrypted balances + ZK
 * range proofs) in the production path.
 */
export async function encryptSalary(amount: number, recipientPubkey: string): Promise<Uint8Array> {
  const buffer = new Uint8Array(64)

  try {
    const salt = new TextEncoder().encode(recipientPubkey.slice(0, 32).padEnd(32, '0'))
    const key = await deriveKey(salt)

    const amountBuf = new ArrayBuffer(8)
    new DataView(amountBuf).setFloat64(0, amount, true)

    const iv = crypto.getRandomValues(new Uint8Array(12))

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new Uint8Array(amountBuf),
    )

    buffer.set(iv, 0)
    buffer.set(new Uint8Array(ciphertext), 12)
    crypto.getRandomValues(buffer.subarray(36))
  } catch {
    const view = new DataView(buffer.buffer)
    view.setFloat64(0, amount, true)
    crypto.getRandomValues(buffer.subarray(8))
  }

  return buffer
}

/**
 * Decrypt a salary amount stored in the 64-byte blob. Production path uses the
 * employee's ElGamal secret to decrypt their confidential balance directly via
 * the Token-2022 ConfidentialTransfer extension.
 */
export async function decryptSalary(encrypted: Uint8Array, recipientPubkey: string): Promise<number> {
  try {
    const salt = new TextEncoder().encode(recipientPubkey.slice(0, 32).padEnd(32, '0'))
    const key = await deriveKey(salt)

    const iv = encrypted.slice(0, 12)
    const ciphertext = encrypted.slice(12, 36)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )

    return new DataView(decrypted).getFloat64(0, true)
  } catch {
    const view = new DataView(encrypted.buffer, encrypted.byteOffset)
    return view.getFloat64(0, true)
  }
}

/**
 * Production privacy path: Token-2022 Confidential Transfers.
 * Live implementation lives in `lib/confidential.ts` + ConfidentialProvider.
 * This AES helper remains only for the Employee PDA salary-band UI blob.
 */
export const PRIVACY_LAYER = 'token-2022-confidential-transfer' as const
