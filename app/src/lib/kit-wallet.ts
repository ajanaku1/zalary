// Bridge wallet-adapter-react → Solana Kit MessagePartialSigner / TransactionSigner.
// Confidential Transfer helpers need Kit signers for key derivation and ix accounts.

import {
  address,
  type Address,
  type MessagePartialSigner,
  type SignatureBytes,
  type TransactionSigner,
} from '@solana/kit'
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'

export type WalletSignMessage = (message: Uint8Array) => Promise<Uint8Array>
export type WalletSignTransaction = <T extends Transaction | VersionedTransaction>(
  transaction: T,
) => Promise<T>

/** Kit MessagePartialSigner backed by wallet-adapter `signMessage`. */
export function createMessageSignerFromWallet(
  publicKey: PublicKey,
  signMessage: WalletSignMessage,
): MessagePartialSigner {
  const addr = address(publicKey.toBase58())
  return {
    address: addr,
    async signMessages(messages) {
      return Promise.all(
        messages.map(async (message) => {
          const sig = await signMessage(message.content)
          return { [addr]: sig as SignatureBytes }
        }),
      )
    },
  }
}

/**
 * Minimal TransactionSigner for Kit instruction builders that only need
 * `address` + AccountSignerMeta. Actual tx signing still goes through
 * wallet-adapter (web3.js) after Kit ixs are converted.
 */
export function createAddressSigner(publicKey: PublicKey | string): TransactionSigner {
  const addr = typeof publicKey === 'string'
    ? address(publicKey)
    : address(publicKey.toBase58())
  return {
    address: addr,
    // Kit may call this when packing plans; we never use Kit's send path.
    async signTransactions() {
      throw new Error('Use wallet-adapter to sign transactions; Kit signer is address-only.')
    },
  } as TransactionSigner
}

export function asAddress(pubkey: PublicKey | string): Address {
  return typeof pubkey === 'string' ? address(pubkey) : address(pubkey.toBase58())
}
