import type { ReactNode } from 'react'
import { PrivyProvider as PrivySDKProvider } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import { PRIVY_APP_ID } from '../lib/privy'

// Privy v3: Solana support is opt-in. `toSolanaWalletConnectors` registers the
// Solana connectors so useWallets / useSignAndSendTransaction from
// @privy-io/react-auth/solana resolve. `embeddedWallets.solana.createOnLogin`
// auto-provisions a non-custodial Solana wallet for any user who signs in via
// email/Google/Twitter without bringing their own wallet — turning the email
// signup path into a first-class on-chain identity.
const solanaConnectors = toSolanaWalletConnectors()

export default function PrivyProvider({ children }: { children: ReactNode }) {
  return (
    <PrivySDKProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#6c5ce7',
          walletChainType: 'solana-only',
        },
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
      } as any}
    >
      {children}
    </PrivySDKProvider>
  )
}
