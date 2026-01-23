import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isArConnectInstalled,
  getArConnect,
  connectWallet,
  disconnectWallet,
  getWalletAddress,
  getPublicKey,
  signMessage,
  encryptData,
  decryptData,
  formatAddress,
  isValidAddress,
  onWalletEvent,
  WalletError,
  WALLET_PERMISSIONS
} from '../lib/wallet'
import { resetWalletMock, removeWalletMock, createWalletMock } from './setup'

describe('Wallet Utilities', () => {
  beforeEach(() => {
    resetWalletMock()
  })

  describe('isArConnectInstalled', () => {
    it('should return true when ArConnect is installed', () => {
      expect(isArConnectInstalled()).toBe(true)
    })

    it('should return false when ArConnect is not installed', () => {
      removeWalletMock()
      expect(isArConnectInstalled()).toBe(false)
    })
  })

  describe('getArConnect', () => {
    it('should return the wallet object when installed', () => {
      const wallet = getArConnect()
      expect(wallet).toBeDefined()
      expect(wallet.connect).toBeDefined()
    })

    it('should return null when not installed', () => {
      removeWalletMock()
      expect(getArConnect()).toBeNull()
    })
  })

  describe('connectWallet', () => {
    const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'

    it('should connect and return address on success', async () => {
      createWalletMock({
        connect: vi.fn().mockResolvedValue(undefined),
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress)
      })

      const address = await connectWallet()
      expect(address).toBe(mockAddress)
      expect(window.arweaveWallet.connect).toHaveBeenCalledWith(WALLET_PERMISSIONS)
    })

    it('should use custom permissions when provided', async () => {
      const customPermissions = ['ACCESS_ADDRESS']
      createWalletMock({
        connect: vi.fn().mockResolvedValue(undefined),
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress)
      })

      await connectWallet(customPermissions)
      expect(window.arweaveWallet.connect).toHaveBeenCalledWith(customPermissions)
    })

    it('should throw NOT_INSTALLED error when wallet not installed', async () => {
      removeWalletMock()

      await expect(connectWallet()).rejects.toThrow(WalletError)
      await expect(connectWallet()).rejects.toMatchObject({
        code: 'NOT_INSTALLED'
      })
    })

    it('should throw USER_CANCELLED error when user cancels', async () => {
      createWalletMock({
        connect: vi.fn().mockRejectedValue(new Error('User cancelled the connection'))
      })

      await expect(connectWallet()).rejects.toThrow(WalletError)
      await expect(connectWallet()).rejects.toMatchObject({
        code: 'USER_CANCELLED'
      })
    })

    it('should throw CONNECTION_FAILED error on other errors', async () => {
      createWalletMock({
        connect: vi.fn().mockRejectedValue(new Error('Network error'))
      })

      await expect(connectWallet()).rejects.toThrow(WalletError)
      await expect(connectWallet()).rejects.toMatchObject({
        code: 'CONNECTION_FAILED'
      })
    })
  })

  describe('disconnectWallet', () => {
    it('should disconnect successfully', async () => {
      createWalletMock({
        disconnect: vi.fn().mockResolvedValue(undefined)
      })

      await disconnectWallet()
      expect(window.arweaveWallet.disconnect).toHaveBeenCalled()
    })

    it('should throw NOT_INSTALLED error when wallet not installed', async () => {
      removeWalletMock()

      await expect(disconnectWallet()).rejects.toThrow(WalletError)
      await expect(disconnectWallet()).rejects.toMatchObject({
        code: 'NOT_INSTALLED'
      })
    })

    it('should throw DISCONNECT_FAILED error on failure', async () => {
      createWalletMock({
        disconnect: vi.fn().mockRejectedValue(new Error('Disconnect failed'))
      })

      await expect(disconnectWallet()).rejects.toThrow(WalletError)
      await expect(disconnectWallet()).rejects.toMatchObject({
        code: 'DISCONNECT_FAILED'
      })
    })
  })

  describe('getWalletAddress', () => {
    it('should return address when connected', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress)
      })

      const address = await getWalletAddress()
      expect(address).toBe(mockAddress)
    })

    it('should return null when wallet not installed', async () => {
      removeWalletMock()
      const address = await getWalletAddress()
      expect(address).toBeNull()
    })

    it('should return null on error', async () => {
      createWalletMock({
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      const address = await getWalletAddress()
      expect(address).toBeNull()
    })
  })

  describe('getPublicKey', () => {
    const mockPublicKey = 'mockPublicKey123'

    it('should return public key on success', async () => {
      createWalletMock({
        getActivePublicKey: vi.fn().mockResolvedValue(mockPublicKey)
      })

      const publicKey = await getPublicKey()
      expect(publicKey).toBe(mockPublicKey)
    })

    it('should throw NOT_INSTALLED error when wallet not installed', async () => {
      removeWalletMock()

      await expect(getPublicKey()).rejects.toThrow(WalletError)
      await expect(getPublicKey()).rejects.toMatchObject({
        code: 'NOT_INSTALLED'
      })
    })

    it('should throw PUBLIC_KEY_FAILED error on failure', async () => {
      createWalletMock({
        getActivePublicKey: vi.fn().mockRejectedValue(new Error('Failed'))
      })

      await expect(getPublicKey()).rejects.toThrow(WalletError)
      await expect(getPublicKey()).rejects.toMatchObject({
        code: 'PUBLIC_KEY_FAILED'
      })
    })
  })

  describe('signMessage', () => {
    const mockData = new Uint8Array([1, 2, 3])
    const mockSignature = new Uint8Array([4, 5, 6])

    it('should sign message on success', async () => {
      createWalletMock({
        signMessage: vi.fn().mockResolvedValue(mockSignature)
      })

      const signature = await signMessage(mockData)
      expect(signature).toEqual(mockSignature)
    })

    it('should pass options to wallet', async () => {
      const options = { hashAlgorithm: 'SHA-256' }
      createWalletMock({
        signMessage: vi.fn().mockResolvedValue(mockSignature)
      })

      await signMessage(mockData, options)
      expect(window.arweaveWallet.signMessage).toHaveBeenCalledWith(mockData, options)
    })

    it('should throw NOT_INSTALLED error when wallet not installed', async () => {
      removeWalletMock()

      await expect(signMessage(mockData)).rejects.toThrow(WalletError)
      await expect(signMessage(mockData)).rejects.toMatchObject({
        code: 'NOT_INSTALLED'
      })
    })

    it('should throw SIGN_FAILED error on failure', async () => {
      createWalletMock({
        signMessage: vi.fn().mockRejectedValue(new Error('Sign failed'))
      })

      await expect(signMessage(mockData)).rejects.toThrow(WalletError)
      await expect(signMessage(mockData)).rejects.toMatchObject({
        code: 'SIGN_FAILED'
      })
    })
  })

  describe('encryptData', () => {
    const mockData = new Uint8Array([1, 2, 3])
    const mockPublicKey = 'publicKey123'
    const mockEncrypted = new Uint8Array([7, 8, 9])

    it('should encrypt data on success', async () => {
      createWalletMock({
        encrypt: vi.fn().mockResolvedValue(mockEncrypted)
      })

      const encrypted = await encryptData(mockData, mockPublicKey)
      expect(encrypted).toEqual(mockEncrypted)
      expect(window.arweaveWallet.encrypt).toHaveBeenCalledWith(mockData, mockPublicKey)
    })

    it('should throw NOT_INSTALLED error when wallet not installed', async () => {
      removeWalletMock()

      await expect(encryptData(mockData, mockPublicKey)).rejects.toThrow(WalletError)
      await expect(encryptData(mockData, mockPublicKey)).rejects.toMatchObject({
        code: 'NOT_INSTALLED'
      })
    })

    it('should throw ENCRYPT_FAILED error on failure', async () => {
      createWalletMock({
        encrypt: vi.fn().mockRejectedValue(new Error('Encrypt failed'))
      })

      await expect(encryptData(mockData, mockPublicKey)).rejects.toThrow(WalletError)
      await expect(encryptData(mockData, mockPublicKey)).rejects.toMatchObject({
        code: 'ENCRYPT_FAILED'
      })
    })
  })

  describe('decryptData', () => {
    const mockEncrypted = new Uint8Array([7, 8, 9])
    const mockDecrypted = new Uint8Array([1, 2, 3])

    it('should decrypt data on success', async () => {
      createWalletMock({
        decrypt: vi.fn().mockResolvedValue(mockDecrypted)
      })

      const decrypted = await decryptData(mockEncrypted)
      expect(decrypted).toEqual(mockDecrypted)
      expect(window.arweaveWallet.decrypt).toHaveBeenCalledWith(mockEncrypted)
    })

    it('should throw NOT_INSTALLED error when wallet not installed', async () => {
      removeWalletMock()

      await expect(decryptData(mockEncrypted)).rejects.toThrow(WalletError)
      await expect(decryptData(mockEncrypted)).rejects.toMatchObject({
        code: 'NOT_INSTALLED'
      })
    })

    it('should throw DECRYPT_FAILED error on failure', async () => {
      createWalletMock({
        decrypt: vi.fn().mockRejectedValue(new Error('Decrypt failed'))
      })

      await expect(decryptData(mockEncrypted)).rejects.toThrow(WalletError)
      await expect(decryptData(mockEncrypted)).rejects.toMatchObject({
        code: 'DECRYPT_FAILED'
      })
    })
  })

  describe('formatAddress', () => {
    it('should format address with default parameters', () => {
      const address = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      expect(formatAddress(address)).toBe('xxxxxx...1234')
    })

    it('should format address with custom parameters', () => {
      const address = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      expect(formatAddress(address, 4, 6)).toBe('xxxx...xx1234')
    })

    it('should return original address if too short', () => {
      const address = 'short'
      expect(formatAddress(address)).toBe('short')
    })

    it('should handle null/undefined', () => {
      expect(formatAddress(null)).toBeNull()
      expect(formatAddress(undefined)).toBeUndefined()
    })

    it('should handle empty string', () => {
      expect(formatAddress('')).toBe('')
    })
  })

  describe('isValidAddress', () => {
    it('should return true for valid 43-character base64url address', () => {
      // Valid Arweave addresses are 43 characters, base64url encoded
      expect(isValidAddress('abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE')).toBe(true)
      expect(isValidAddress('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-abcde')).toBe(true)
    })

    it('should return false for invalid addresses', () => {
      // Too short
      expect(isValidAddress('short')).toBe(false)
      // Too long
      expect(isValidAddress('abcdefghijklmnopqrstuvwxyz0123456789_-ABCDEFGH')).toBe(false)
      // Invalid characters
      expect(isValidAddress('abcdefghijklmnopqrstuvwxyz0123456789+/ABCDE')).toBe(false)
    })

    it('should return false for null/undefined/non-string', () => {
      expect(isValidAddress(null)).toBe(false)
      expect(isValidAddress(undefined)).toBe(false)
      expect(isValidAddress(12345)).toBe(false)
      expect(isValidAddress({})).toBe(false)
    })
  })

  describe('onWalletEvent', () => {
    it('should subscribe to valid events', () => {
      const callback = vi.fn()
      createWalletMock()

      const unsubscribe = onWalletEvent('walletSwitch', callback)
      expect(window.arweaveWallet.on).toHaveBeenCalledWith('walletSwitch', callback)
      expect(typeof unsubscribe).toBe('function')
    })

    it('should unsubscribe when cleanup is called', () => {
      const callback = vi.fn()
      createWalletMock()

      const unsubscribe = onWalletEvent('disconnect', callback)
      unsubscribe()
      expect(window.arweaveWallet.off).toHaveBeenCalledWith('disconnect', callback)
    })

    it('should return no-op when wallet not installed', () => {
      removeWalletMock()
      const callback = vi.fn()

      const unsubscribe = onWalletEvent('walletSwitch', callback)
      expect(typeof unsubscribe).toBe('function')
      // Should not throw
      unsubscribe()
    })

    it('should warn on invalid event names', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const callback = vi.fn()

      onWalletEvent('invalidEvent', callback)
      expect(consoleSpy).toHaveBeenCalledWith('Unknown wallet event: invalidEvent')
      consoleSpy.mockRestore()
    })
  })

  describe('WalletError', () => {
    it('should create error with message and code', () => {
      const error = new WalletError('Test error', 'TEST_CODE')
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.name).toBe('WalletError')
    })

    it('should be instanceof Error', () => {
      const error = new WalletError('Test', 'CODE')
      expect(error instanceof Error).toBe(true)
      expect(error instanceof WalletError).toBe(true)
    })
  })

  describe('WALLET_PERMISSIONS', () => {
    it('should include all required permissions', () => {
      expect(WALLET_PERMISSIONS).toContain('ACCESS_ADDRESS')
      expect(WALLET_PERMISSIONS).toContain('ACCESS_PUBLIC_KEY')
      expect(WALLET_PERMISSIONS).toContain('SIGN_TRANSACTION')
      expect(WALLET_PERMISSIONS).toContain('DISPATCH')
      expect(WALLET_PERMISSIONS).toContain('ENCRYPT')
      expect(WALLET_PERMISSIONS).toContain('DECRYPT')
    })

    it('should be an array of strings', () => {
      expect(Array.isArray(WALLET_PERMISSIONS)).toBe(true)
      WALLET_PERMISSIONS.forEach(permission => {
        expect(typeof permission).toBe('string')
      })
    })
  })
})
