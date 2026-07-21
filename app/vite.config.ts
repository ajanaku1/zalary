import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({ include: ['buffer', 'crypto', 'stream', 'util'] }),
    wasm(),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  optimizeDeps: {
    exclude: ['@solana/zk-sdk'],
  },
  assetsInclude: ['**/*.wasm'],
  // Vite 8 / Rolldown: keep WASM as binary assets for the zk-sdk bundler build.
  build: {
    target: 'esnext',
  },
})
