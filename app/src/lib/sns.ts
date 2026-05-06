import { Connection } from '@solana/web3.js'

// Resolve a .sol domain to a wallet address
export async function resolveSolDomain(domain: string, connection: Connection): Promise<string | null> {
  try {
    // Remove .sol suffix if present
    const name = domain.replace(/\.sol$/, '')

    // Use Bonfida SNS SDK
    const { resolve } = await import('@bonfida/spl-name-service')
    const owner = await resolve(connection, name)
    return owner.toBase58()
  } catch {
    return null
  }
}
