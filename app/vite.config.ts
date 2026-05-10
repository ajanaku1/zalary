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
  optimizeDeps: {
    // snarkjs is pulled in transitively by @umbra-privacy/web-zk-prover.
    // Listing it here forces Vite to pre-bundle it so the prover's import
    // resolves instead of throwing during module graph analysis.
    include: ['snarkjs'],
  },
  server: {
    proxy: {
      // Umbra's faucet API doesn't return CORS headers for browser-origin
      // POSTs. Proxy it through the dev server so the request looks same-origin.
      '/_umbra-faucet': {
        target: 'https://faucet.umbraprivacy.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/_umbra-faucet/, ''),
      },
    },
  },
})
