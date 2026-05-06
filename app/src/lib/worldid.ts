// World ID configuration
// App ID from https://developer.worldcoin.org
export const WORLD_ID_APP_ID = import.meta.env.VITE_WORLD_ID_APP_ID || ''
export const WORLD_ID_ACTION = 'verify-employee'

export interface WorldIdProof {
  merkle_root: string
  nullifier_hash: string
  proof: string
  verification_level: 'orb' | 'device'
}

// Verification helper — call World ID widget, return proof
export async function verifyWithWorldId(): Promise<WorldIdProof | null> {
  // Will be implemented when World ID widget is integrated
  // For hackathon demo, return a mock proof
  console.warn('World ID: Using mock verification for devnet demo')
  return {
    merkle_root: '0x' + '0'.repeat(64),
    nullifier_hash: '0x' + '1'.repeat(64),
    proof: '0x' + '2'.repeat(256),
    verification_level: 'device',
  }
}
