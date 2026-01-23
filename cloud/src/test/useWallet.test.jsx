import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { WalletProvider, useWallet } from '../hooks/useWallet'
import { resetWalletMock, removeWalletMock, createWalletMock } from './setup'

// Wrapper component for the hook
const wrapper = ({ children }) => (
  <WalletProvider>{children}</WalletProvider>
)

describe('useWallet Hook', () => {
  beforeEach(() => {
    resetWalletMock()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('should detect when ArConnect is installed', async () => {
      createWalletMock({
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.isInstalled).toBe(true)
      })
    })

    it('should detect when ArConnect is not installed', async () => {
      removeWalletMock()

      const { result } = renderHook(() => useWallet(), { wrapper })

      // Wait for the delayed check
      await act(async () => {
        vi.advanceTimersByTime(1100)
      })

      expect(result.current.isInstalled).toBe(false)
    })

    it('should check for existing connection on mount', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress)
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.address).toBe(mockAddress)
        expect(result.current.isConnected).toBe(true)
      })
    })

    it('should not be connected if getActiveAddress fails', async () => {
      createWalletMock({
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.isInstalled).toBe(true)
      })

      expect(result.current.address).toBeNull()
      expect(result.current.isConnected).toBe(false)
    })

    it('should format address correctly', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress)
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.formattedAddress).toBe('xxxxxx...1234')
      })
    })
  })

  describe('connect', () => {
    it('should connect successfully', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        connect: vi.fn().mockResolvedValue(undefined),
        getActiveAddress: vi.fn()
          .mockRejectedValueOnce(new Error('Not connected'))
          .mockResolvedValue(mockAddress)
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await act(async () => {
        await result.current.connect()
      })

      expect(result.current.address).toBe(mockAddress)
      expect(result.current.isConnected).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('should set isConnecting while connecting', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      let resolveConnect
      createWalletMock({
        connect: vi.fn().mockImplementation(() => new Promise(resolve => {
          resolveConnect = resolve
        })),
        getActiveAddress: vi.fn()
          .mockRejectedValueOnce(new Error('Not connected'))
          .mockResolvedValue(mockAddress)
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      let connectPromise
      act(() => {
        connectPromise = result.current.connect()
      })

      await waitFor(() => {
        expect(result.current.isConnecting).toBe(true)
      })

      await act(async () => {
        resolveConnect()
        await connectPromise
      })

      expect(result.current.isConnecting).toBe(false)
    })

    it('should handle connection errors', async () => {
      createWalletMock({
        connect: vi.fn().mockRejectedValue(new Error('User cancelled')),
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await act(async () => {
        try {
          await result.current.connect()
        } catch (e) {
          // Expected to throw
        }
      })

      expect(result.current.error).not.toBeNull()
      expect(result.current.isConnected).toBe(false)
    })

    it('should clear previous errors when connecting', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        connect: vi.fn()
          .mockRejectedValueOnce(new Error('First error'))
          .mockResolvedValue(undefined),
        getActiveAddress: vi.fn()
          .mockRejectedValueOnce(new Error('Not connected'))
          .mockResolvedValue(mockAddress)
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      // First attempt fails
      await act(async () => {
        try {
          await result.current.connect()
        } catch (e) {
          // Expected
        }
      })

      expect(result.current.error).not.toBeNull()

      // Second attempt should clear error first
      await act(async () => {
        await result.current.connect()
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress),
        disconnect: vi.fn().mockResolvedValue(undefined)
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true)
      })

      await act(async () => {
        await result.current.disconnect()
      })

      expect(result.current.address).toBeNull()
      expect(result.current.isConnected).toBe(false)
    })

    it('should handle disconnect errors', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress),
        disconnect: vi.fn().mockRejectedValue(new Error('Disconnect failed'))
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true)
      })

      await act(async () => {
        try {
          await result.current.disconnect()
        } catch (e) {
          // Expected
        }
      })

      expect(result.current.error).not.toBeNull()
    })
  })

  describe('clearError', () => {
    it('should clear error state', async () => {
      createWalletMock({
        connect: vi.fn().mockRejectedValue(new Error('Error')),
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await act(async () => {
        try {
          await result.current.connect()
        } catch (e) {
          // Expected
        }
      })

      expect(result.current.error).not.toBeNull()

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('wallet events', () => {
    it('should handle walletSwitch event', async () => {
      const mockAddress1 = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1111'
      const mockAddress2 = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy2222'
      let walletSwitchCallback

      createWalletMock({
        getActiveAddress: vi.fn()
          .mockResolvedValueOnce(mockAddress1)
          .mockResolvedValue(mockAddress2),
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'walletSwitch') {
            walletSwitchCallback = callback
          }
        }),
        off: vi.fn()
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.address).toBe(mockAddress1)
      })

      // Simulate wallet switch
      await act(async () => {
        walletSwitchCallback()
      })

      await waitFor(() => {
        expect(result.current.address).toBe(mockAddress2)
      })
    })

    it('should handle disconnect event', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      let disconnectCallback

      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress),
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'disconnect') {
            disconnectCallback = callback
          }
        }),
        off: vi.fn()
      })

      const { result } = renderHook(() => useWallet(), { wrapper })

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true)
      })

      // Simulate disconnect event
      act(() => {
        disconnectCallback()
      })

      expect(result.current.address).toBeNull()
      expect(result.current.isConnected).toBe(false)
    })
  })

  describe('context error', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useWallet())
      }).toThrow('useWallet must be used within a WalletProvider')

      consoleSpy.mockRestore()
    })
  })
})
