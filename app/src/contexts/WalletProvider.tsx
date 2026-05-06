import { type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { connection } from '../lib/helius'
import { wallets } from '../lib/phantom'

import '@solana/wallet-adapter-react-ui/styles.css'

interface Props {
  children: ReactNode
}

export default function WalletProvider({ children }: Props) {
  return (
    <ConnectionProvider endpoint={connection.rpcEndpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
}
