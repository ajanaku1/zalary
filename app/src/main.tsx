import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import PrivyProvider from './contexts/PrivyProvider'
import WalletProvider from './contexts/WalletProvider'
import UmbraProvider from './contexts/UmbraProvider'
import { RoleProvider } from './contexts/RoleContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider>
      <WalletProvider>
        <UmbraProvider>
          <BrowserRouter>
            <RoleProvider>
              <App />
            </RoleProvider>
          </BrowserRouter>
        </UmbraProvider>
      </WalletProvider>
    </PrivyProvider>
  </StrictMode>,
)
