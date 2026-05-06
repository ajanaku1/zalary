import { ReactNode } from 'react'
import { PrivyProvider as PrivySDKProvider } from '@privy-io/react-auth'
import { PRIVY_APP_ID } from '../lib/privy'

export default function PrivyProvider({ children }: { children: ReactNode }) {
  return (
    <PrivySDKProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#6c5ce7',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      {children}
    </PrivySDKProvider>
  )
}
