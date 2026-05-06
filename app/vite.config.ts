import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const stubOptionalSolana = {
  name: 'stub-optional-solana',
  resolveId(id: string) {
    if (id.startsWith('@solana/kit') || id.startsWith('@solana-program/')) {
      return '\0stub-solana'
    }
  },
  load(id: string) {
    if (id === '\0stub-solana') return 'export default {}'
  },
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({ include: ['buffer', 'crypto', 'stream', 'util'] }),
    stubOptionalSolana,
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
