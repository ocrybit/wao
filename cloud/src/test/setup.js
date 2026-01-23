import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect method with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test case
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Default mock for arweaveWallet (can be overridden in individual tests)
const createMockWallet = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getActiveAddress: vi.fn(),
  getActivePublicKey: vi.fn(),
  signMessage: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
})

// Set up a default mock wallet
window.arweaveWallet = createMockWallet()

// Export helper to reset wallet mock
export const resetWalletMock = () => {
  window.arweaveWallet = createMockWallet()
}

// Export helper to remove wallet mock
export const removeWalletMock = () => {
  delete window.arweaveWallet
}

// Export helper to create custom wallet mock
export const createWalletMock = (overrides = {}) => {
  window.arweaveWallet = {
    ...createMockWallet(),
    ...overrides,
  }
  return window.arweaveWallet
}
