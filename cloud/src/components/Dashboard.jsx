import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../hooks/useWallet'
import WalletConnect from './WalletConnect'

function Dashboard() {
  const { isConnected, address, formattedAddress, disconnect } = useWallet()
  const navigate = useNavigate()

  // Redirect to landing if not connected
  useEffect(() => {
    if (!isConnected) {
      navigate('/')
    }
  }, [isConnected, navigate])

  const handleLogout = async () => {
    await disconnect()
    navigate('/')
  }

  if (!isConnected) {
    return null
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="logo">
          <svg className="logo-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="url(#gradient)" />
            <path d="M12 20L18 26L28 14" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <span className="logo-text">Enc Cloud</span>
        </div>
        <div className="dashboard-header-right">
          <WalletConnect showDisconnect={true} />
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-welcome">
          <h1>Welcome to Enc Cloud</h1>
          <p>Connected as: <strong title={address}>{formattedAddress}</strong></p>
        </div>

        <section className="dashboard-section">
          <h2>Your Files</h2>
          <div className="files-empty">
            <svg className="files-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            <p>No files yet</p>
            <button className="upload-button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Upload Files
            </button>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Storage Stats</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">0</span>
              <span className="stat-label">Files</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">0 B</span>
              <span className="stat-label">Used</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">--</span>
              <span className="stat-label">Last Upload</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="dashboard-footer">
        <button onClick={handleLogout} className="logout-button">
          Sign Out
        </button>
      </footer>
    </div>
  )
}

export default Dashboard
