// Privy configuration for social login
// Get your App ID from https://dashboard.privy.io
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || ''

export const privyConfig = {
  appId: PRIVY_APP_ID,
  loginMethods: ['email', 'google', 'twitter'] as const,
  appearance: {
    theme: 'dark' as const,
    accentColor: '#6c5ce7',
  },
  embeddedWallets: {
    createOnLogin: 'users-without-wallets' as const,
  },
}
