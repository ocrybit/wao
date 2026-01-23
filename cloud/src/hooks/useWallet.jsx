import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  isArConnectInstalled,
  connectWallet,
  disconnectWallet,
  getWalletAddress,
  formatAddress,
  onWalletEvent,
  WalletError
} from '../lib/wallet'

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)

  // Check if ArConnect is installed on mount
  useEffect(() => {
    const checkInstalled = () => {
      setIsInstalled(isArConnectInstalled())
    }

    // Check immediately
    checkInstalled()

    // Also check after a delay (ArConnect may load async)
    const timeout = setTimeout(checkInstalled, 1000)

    return () => clearTimeout(timeout)
  }, [])

  // Check for existing connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (!isInstalled) return

      try {
        const addr = await getWalletAddress()
        if (addr) {
          setAddress(addr)
          setIsConnected(true)
        }
      } catch {
        // Not connected, ignore
      }
    }

    checkConnection()
  }, [isInstalled])

  // Listen for wallet events
  useEffect(() => {
    if (!isInstalled) return

    const unsubSwitch = onWalletEvent('walletSwitch', async () => {
      try {
        const addr = await getWalletAddress()
        setAddress(addr)
      } catch {
        setAddress(null)
        setIsConnected(false)
      }
    })

    const unsubDisconnect = onWalletEvent('disconnect', () => {
      setAddress(null)
      setIsConnected(false)
    })

    return () => {
      unsubSwitch()
      unsubDisconnect()
    }
  }, [isInstalled])

  const connect = useCallback(async () => {
    setError(null)
    setIsConnecting(true)

    try {
      const addr = await connectWallet()
      setAddress(addr)
      setIsConnected(true)
      return addr
    } catch (err) {
      const walletError = err instanceof WalletError
        ? err
        : new WalletError(err.message, 'UNKNOWN')
      setError(walletError)
      throw walletError
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setError(null)

    try {
      await disconnectWallet()
      setAddress(null)
      setIsConnected(false)
    } catch (err) {
      const walletError = err instanceof WalletError
        ? err
        : new WalletError(err.message, 'UNKNOWN')
      setError(walletError)
      throw walletError
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const value = {
    address,
    formattedAddress: address ? formatAddress(address) : null,
    isConnecting,
    isConnected,
    isInstalled,
    error,
    connect,
    disconnect,
    clearError
  }

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

export default useWallet
