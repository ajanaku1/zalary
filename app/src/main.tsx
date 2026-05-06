import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import PrivyProvider from './contexts/PrivyProvider'
import WalletProvider from './contexts/WalletProvider'
import { RoleProvider } from './contexts/RoleContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider>
      <WalletProvider>
        <BrowserRouter>
          <RoleProvider>
            <App />
          </RoleProvider>
        </BrowserRouter>
      </WalletProvider>
    </PrivyProvider>
  </StrictMode>,
)
