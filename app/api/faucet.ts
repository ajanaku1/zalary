import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'

const ZUSDC_MINT = new PublicKey('2Bis7EEvjTnQLwLnAtquKxS4y2uyzhbNuzoW6UEN68Gv')
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com'
const AMOUNT_PER_REQUEST = 1_000_000_000 // 1000 zUSDC (6 decimals)

function loadFaucetKeypair(): Keypair {
  const raw = process.env.FAUCET_PRIVATE_KEY
  if (!raw) throw new Error('FAUCET_PRIVATE_KEY env var is not set')
  const arr = JSON.parse(raw) as number[]
  return Keypair.fromSecretKey(Uint8Array.from(arr))
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const wallet = (req.query?.wallet as string) || (req.body?.wallet as string)
    if (!wallet) {
      res.status(400).json({ error: 'Missing wallet query param' })
      return
    }

    const recipient = new PublicKey(wallet)
    const faucet = loadFaucetKeypair()
    const connection = new Connection(RPC_URL, 'confirmed')

    const recipientAta = getAssociatedTokenAddressSync(ZUSDC_MINT, recipient)

    const tx = new Transaction()
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        faucet.publicKey,
        recipientAta,
        recipient,
        ZUSDC_MINT,
      ),
    )
    tx.add(
      createMintToInstruction(
        ZUSDC_MINT,
        recipientAta,
        faucet.publicKey,
        AMOUNT_PER_REQUEST,
        [],
        TOKEN_PROGRAM_ID,
      ),
    )

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    tx.recentBlockhash = blockhash
    tx.feePayer = faucet.publicKey
    tx.sign(faucet)

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

    res.status(200).json({
      sig,
      amount: AMOUNT_PER_REQUEST / 1_000_000,
      mint: ZUSDC_MINT.toBase58(),
      ata: recipientAta.toBase58(),
    })
  } catch (err: any) {
    console.error('faucet error:', err)
    res.status(500).json({ error: err?.message || 'Faucet failed' })
  }
}
