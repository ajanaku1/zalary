// Smoke test for @umbra-privacy/sdk on devnet.
//
// Generates a fresh keypair, airdrops devnet SOL, builds the Umbra client,
// runs the idempotent confidential registration, and queries the resulting
// encrypted user account. Prints each step so we can confirm the SDK
// matches the published docs before wiring it into the app.
//
// Run: npx tsx scripts/umbra-smoke.ts

import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import {
  getUmbraClient,
  getUserRegistrationFunction,
  getUserAccountQuerierFunction,
  createSignerFromPrivateKeyBytes,
} from '@umbra-privacy/sdk'
import { address } from '@solana/kit'

const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, '..', '.env.local') })
loadEnv({ path: resolve(here, '..', '.env') })

const HELIUS_RPC = process.env.VITE_HELIUS_RPC_URL ?? ''
const RPC_HTTP = process.env.RPC_HTTP ?? HELIUS_RPC ?? 'https://api.devnet.solana.com'
const RPC_WS = process.env.RPC_WS ?? (HELIUS_RPC
  ? HELIUS_RPC.replace('https://', 'wss://').replace('devnet.helius-rpc.com', 'devnet.helius-rpc.com')
  : 'wss://api.devnet.solana.com')
const INDEXER = 'https://utxo-indexer.api-devnet.umbraprivacy.com'

async function main() {
  const raw = process.env.DEMO_AUTHORITY_KEYPAIR
  if (!raw) throw new Error('DEMO_AUTHORITY_KEYPAIR missing from .env.local')
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
  console.log('[smoke] keypair:', kp.publicKey.toBase58())

  const conn = new Connection(RPC_HTTP, 'confirmed')
  const bal = await conn.getBalance(kp.publicKey)
  console.log('[smoke] balance lamports:', bal)
  if (bal < 0.05 * LAMPORTS_PER_SOL) throw new Error('keypair underfunded; need ≥ 0.05 SOL')

  console.log('[smoke] building Umbra signer (Ed25519 keypair = 64 bytes)...')
  const signer = await createSignerFromPrivateKeyBytes(kp.secretKey)

  console.log('[smoke] constructing Umbra client (devnet)...')
  const client = await getUmbraClient({
    signer,
    network: 'devnet',
    rpcUrl: RPC_HTTP,
    rpcSubscriptionsUrl: RPC_WS,
    indexerApiEndpoint: INDEXER,
    deferMasterSeedSignature: false,
  })
  console.log('[smoke] client ready')

  console.log('[smoke] registering (confidential only — no zk-prover yet)...')
  const register = getUserRegistrationFunction({ client })
  const sigs = await register({
    confidential: true,
    anonymous: false,
    callbacks: {
      userAccountInitialisation: {
        pre: (ctx: any) => console.log('  step1 init pre, skipped=', ctx.skipped),
        post: (ctx: any) => console.log('  step1 init post, sig=', ctx.signature),
      },
      registerX25519PublicKey: {
        pre: (ctx: any) => console.log('  step2 x25519 pre, skipped=', ctx.skipped),
        post: (ctx: any) => console.log('  step2 x25519 post, sig=', ctx.signature),
      },
    },
  })
  console.log('[smoke] registration tx sigs:', sigs)

  console.log('[smoke] querying user account...')
  const queryUser = getUserAccountQuerierFunction({ client })
  const account = await queryUser(address(kp.publicKey.toBase58()))
  console.log('[smoke] user account:', JSON.stringify(account, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2))

  console.log('[smoke] OK')
}

main().catch((err) => {
  console.error('[smoke] FAIL', err)
  process.exit(1)
})
