/**
 * Wallet utilities for ArConnect integration
 */

export const WALLET_PERMISSIONS = [
  'ACCESS_ADDRESS',
  'ACCESS_PUBLIC_KEY',
  'SIGN_TRANSACTION',
  'DISPATCH',
  'ENCRYPT',
  'DECRYPT'
]

/**
 * Check if ArConnect is installed
 * @returns {boolean}
 */
export function isArConnectInstalled() {
  return typeof window !== 'undefined' && !!window.arweaveWallet
}

/**
 * Get ArConnect wallet instance
 * @returns {object|null}
 */
export function getArConnect() {
  if (!isArConnectInstalled()) return null
  return window.arweaveWallet
}

/**
 * Connect to ArConnect wallet
 * @param {string[]} permissions - Permissions to request
 * @returns {Promise<string>} - Wallet address
 */
export async function connectWallet(permissions = WALLET_PERMISSIONS) {
  const wallet = getArConnect()

  if (!wallet) {
    throw new WalletError('ArConnect not installed', 'NOT_INSTALLED')
  }

  try {
    await wallet.connect(permissions)
    const address = await wallet.getActiveAddress()
    return address
  } catch (error) {
    if (error.message?.includes('User cancelled')) {
      throw new WalletError('Connection cancelled by user', 'USER_CANCELLED')
    }
    throw new WalletError(error.message || 'Failed to connect', 'CONNECTION_FAILED')
  }
}

/**
 * Disconnect from ArConnect wallet
 * @returns {Promise<void>}
 */
export async function disconnectWallet() {
  const wallet = getArConnect()

  if (!wallet) {
    throw new WalletError('ArConnect not installed', 'NOT_INSTALLED')
  }

  try {
    await wallet.disconnect()
  } catch (error) {
    throw new WalletError(error.message || 'Failed to disconnect', 'DISCONNECT_FAILED')
  }
}

/**
 * Get current wallet address
 * @returns {Promise<string|null>}
 */
export async function getWalletAddress() {
  const wallet = getArConnect()

  if (!wallet) return null

  try {
    const address = await wallet.getActiveAddress()
    return address
  } catch {
    return null
  }
}

/**
 * Get wallet public key
 * @returns {Promise<string>}
 */
export async function getPublicKey() {
  const wallet = getArConnect()

  if (!wallet) {
    throw new WalletError('ArConnect not installed', 'NOT_INSTALLED')
  }

  try {
    const publicKey = await wallet.getActivePublicKey()
    return publicKey
  } catch (error) {
    throw new WalletError(error.message || 'Failed to get public key', 'PUBLIC_KEY_FAILED')
  }
}

/**
 * Sign a message with the wallet
 * @param {Uint8Array} data - Data to sign
 * @param {object} options - Signing options
 * @returns {Promise<Uint8Array>}
 */
export async function signMessage(data, options = {}) {
  const wallet = getArConnect()

  if (!wallet) {
    throw new WalletError('ArConnect not installed', 'NOT_INSTALLED')
  }

  try {
    const signature = await wallet.signMessage(data, options)
    return signature
  } catch (error) {
    throw new WalletError(error.message || 'Failed to sign message', 'SIGN_FAILED')
  }
}

/**
 * Encrypt data with the wallet
 * @param {Uint8Array} data - Data to encrypt
 * @param {string} publicKey - Public key to encrypt with
 * @returns {Promise<Uint8Array>}
 */
export async function encryptData(data, publicKey) {
  const wallet = getArConnect()

  if (!wallet) {
    throw new WalletError('ArConnect not installed', 'NOT_INSTALLED')
  }

  try {
    const encrypted = await wallet.encrypt(data, publicKey)
    return encrypted
  } catch (error) {
    throw new WalletError(error.message || 'Failed to encrypt', 'ENCRYPT_FAILED')
  }
}

/**
 * Decrypt data with the wallet
 * @param {Uint8Array} data - Data to decrypt
 * @returns {Promise<Uint8Array>}
 */
export async function decryptData(data) {
  const wallet = getArConnect()

  if (!wallet) {
    throw new WalletError('ArConnect not installed', 'NOT_INSTALLED')
  }

  try {
    const decrypted = await wallet.decrypt(data)
    return decrypted
  } catch (error) {
    throw new WalletError(error.message || 'Failed to decrypt', 'DECRYPT_FAILED')
  }
}

/**
 * Format wallet address for display
 * @param {string} address - Full wallet address
 * @param {number} startChars - Characters to show at start
 * @param {number} endChars - Characters to show at end
 * @returns {string}
 */
export function formatAddress(address, startChars = 6, endChars = 4) {
  if (!address || address.length <= startChars + endChars) return address
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
}

/**
 * Validate Arweave address format
 * @param {string} address - Address to validate
 * @returns {boolean}
 */
export function isValidAddress(address) {
  if (!address || typeof address !== 'string') return false
  // Arweave addresses are 43 characters, base64url encoded
  return /^[a-zA-Z0-9_-]{43}$/.test(address)
}

/**
 * Custom wallet error class
 */
export class WalletError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'WalletError'
    this.code = code
  }
}

/**
 * Listen for wallet events
 * @param {string} event - Event name
 * @param {function} callback - Event handler
 * @returns {function} - Cleanup function
 */
export function onWalletEvent(event, callback) {
  const wallet = getArConnect()
  if (!wallet) return () => {}

  const validEvents = ['walletSwitch', 'disconnect']
  if (!validEvents.includes(event)) {
    console.warn(`Unknown wallet event: ${event}`)
    return () => {}
  }

  wallet.on(event, callback)
  return () => wallet.off(event, callback)
}
