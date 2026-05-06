import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({ include: ['buffer', 'crypto', 'stream', 'util'] }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      // Privy references optional Solana v2 peer deps that we don't use
      external: [
        '@solana/kit',
        '@solana-program/system',
      ],
    },
  },
})
