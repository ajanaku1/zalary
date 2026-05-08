// Tour-mode hook. When the URL contains ?demo=1, the app reads the seeded
// showcase org's data instead of the connected wallet's. Writes stay disabled
// so judges can poke around without owning the keypair.
//
// Configure the seeded authority via VITE_DEMO_ORG_AUTHORITY (Solana pubkey of
// the wallet that owns the demo org). Without it, demo mode is unavailable.

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PublicKey } from '@solana/web3.js'
import { getEnv } from '../lib/env'

export interface DemoState {
  isDemo: boolean
  demoAuthority: PublicKey | null
}

export function useDemoMode(): DemoState {
  const [params] = useSearchParams()
  const flag = params.get('demo') === '1'
  return useMemo(() => {
    if (!flag) return { isDemo: false, demoAuthority: null }
    const raw = getEnv('VITE_DEMO_ORG_AUTHORITY')
    if (!raw) return { isDemo: true, demoAuthority: null }
    try {
      return { isDemo: true, demoAuthority: new PublicKey(raw) }
    } catch {
      return { isDemo: true, demoAuthority: null }
    }
  }, [flag])
}

// True when the configured demo authority is set — used to enable/hide the
// "View demo" buttons on the landing page.
export function isDemoConfigured(): boolean {
  return Boolean(getEnv('VITE_DEMO_ORG_AUTHORITY'))
}
