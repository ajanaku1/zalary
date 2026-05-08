// Bridge from Privy's Solana embedded wallet → an Anchor-friendly signer.
//
// Why this exists:
//   The existing claim_funds path goes through @solana/wallet-adapter-react,
//   which is great for Phantom users but invisible to Privy email signups —
//   they have a Privy-managed wallet that the wallet adapter doesn't see.
//   This hook closes that gap: given a Privy auth session with an embedded
//   Solana wallet, it returns the address + a sign-and-send fn that takes a
//   prebuilt Transaction (built from `program.methods.x().instruction()`).

import { useMemo } from 'react'
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { PublicKey, Transaction, type Connection } from '@solana/web3.js'

export interface PrivyEmbeddedSigner {
  address: PublicKey
  signAndSend: (tx: Transaction, connection: Connection) => Promise<string>
}

export function usePrivyEmbeddedWallet(): PrivyEmbeddedSigner | null {
  const { wallets, ready } = useWallets()
  const { signAndSendTransaction } = useSignAndSendTransaction()

  return useMemo(() => {
    if (!ready) return null
    // Privy embedded wallets advertise walletClientType === 'privy'.
    const embedded = wallets.find((w: any) => w?.walletClientType === 'privy')
    if (!embedded) return null
    const address = new PublicKey(embedded.address)
    const signAndSend = async (tx: Transaction, connection: Connection): Promise<string> => {
      const { blockhash } = await connection.getLatestBlockhash('finalized')
      tx.recentBlockhash = blockhash
      tx.feePayer = address
      const serialized = tx.serializeMessage()
      const result = await signAndSendTransaction({
        transaction: new Uint8Array(serialized),
        wallet: embedded as any,
      })
      // Privy returns { signature: string } for sign-and-send.
      return (result as any)?.signature ?? (result as unknown as string)
    }
    return { address, signAndSend }
  }, [wallets, ready, signAndSendTransaction])
}
