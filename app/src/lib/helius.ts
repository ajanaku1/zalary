import { Connection, clusterApiUrl } from '@solana/web3.js'

// Helius RPC — use free devnet tier
// Users should replace with their own Helius API key from https://helius.dev
const HELIUS_RPC_URL = import.meta.env.VITE_HELIUS_RPC_URL || clusterApiUrl('devnet')

export const connection = new Connection(HELIUS_RPC_URL, 'confirmed')
export const NETWORK = 'devnet' as const
