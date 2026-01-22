import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',  // Use node for HyperBEAM tests
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    testTimeout: 120000,  // 120s for HyperBEAM operations
    pool: 'forks',  // Required for WASM/subprocess isolation
  },
})
