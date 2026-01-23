import { useWallet } from '../hooks/useWallet'

function WalletConnect({ className = '', showDisconnect = false }) {
  const {
    address,
    formattedAddress,
    isConnecting,
    isConnected,
    isInstalled,
    error,
    connect,
    disconnect,
    clearError
  } = useWallet()

  const handleConnect = async () => {
    clearError()
    try {
      await connect()
    } catch (err) {
      console.error('Connection failed:', err)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect()
    } catch (err) {
      console.error('Disconnect failed:', err)
    }
  }

  // Not installed state
  if (!isInstalled) {
    return (
      <div className={`wallet-connect ${className}`}>
        <a
          href="https://www.arconnect.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="wallet-button wallet-button--install"
        >
          <svg className="wallet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          Install ArConnect
        </a>
        <p className="wallet-hint">ArConnect wallet is required to use Enc Cloud</p>
      </div>
    )
  }

  // Connected state
  if (isConnected && address) {
    return (
      <div className={`wallet-connect wallet-connect--connected ${className}`}>
        <div className="wallet-info">
          <div className="wallet-address" title={address}>
            <svg className="wallet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>{formattedAddress}</span>
          </div>
          {showDisconnect && (
            <button
              onClick={handleDisconnect}
              className="wallet-button wallet-button--disconnect"
              aria-label="Disconnect wallet"
            >
              <svg className="wallet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Disconnect
            </button>
          )}
        </div>
      </div>
    )
  }

  // Connecting state
  if (isConnecting) {
    return (
      <div className={`wallet-connect ${className}`}>
        <button className="wallet-button wallet-button--connecting" disabled>
          <svg className="wallet-icon wallet-icon--spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
          Connecting...
        </button>
      </div>
    )
  }

  // Default: not connected
  return (
    <div className={`wallet-connect ${className}`}>
      <button
        onClick={handleConnect}
        className="wallet-button wallet-button--connect"
      >
        <svg className="wallet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        Connect Wallet
      </button>
      {error && (
        <div className="wallet-error" role="alert">
          <span>{error.message}</span>
          <button onClick={clearError} className="wallet-error-close" aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}
    </div>
  )
}

export default WalletConnect
