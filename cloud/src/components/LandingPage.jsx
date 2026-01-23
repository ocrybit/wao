import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../hooks/useWallet'
import WalletConnect from './WalletConnect'

function LandingPage() {
  const { isConnected } = useWallet()
  const navigate = useNavigate()

  // Redirect to dashboard if already connected
  useEffect(() => {
    if (isConnected) {
      navigate('/dashboard')
    }
  }, [isConnected, navigate])

  return (
    <div className="landing-page">
      <header className="landing-header">
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
        <nav className="landing-nav">
          <a href="#features">Features</a>
          <a href="#security">Security</a>
          <a href="#pricing">Pricing</a>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero">
          <h1 className="hero-title">
            Secure, Decentralized
            <span className="hero-highlight"> Cloud Storage</span>
          </h1>
          <p className="hero-subtitle">
            Store your files on Arweave with end-to-end encryption.
            Your data, your keys, forever accessible.
          </p>
          <div className="hero-cta">
            <WalletConnect />
          </div>
          <p className="hero-note">
            Connect your Arweave wallet to get started
          </p>
        </section>

        <section id="features" className="features">
          <h2 className="section-title">Why Enc Cloud?</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
              </div>
              <h3>End-to-End Encrypted</h3>
              <p>Your files are encrypted before they leave your device. Only you hold the keys.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                </svg>
              </div>
              <h3>Permanent Storage</h3>
              <p>Stored on Arweave's permaweb. Pay once, store forever.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3>Censorship Resistant</h3>
              <p>No central authority can delete or modify your data.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
              </div>
              <h3>Decentralized</h3>
              <p>No single point of failure. Your files are distributed globally.</p>
            </div>
          </div>
        </section>

        <section id="security" className="security">
          <h2 className="section-title">Security First</h2>
          <div className="security-content">
            <div className="security-text">
              <p>
                Enc Cloud uses your Arweave wallet for authentication and encryption.
                Files are encrypted client-side using your wallet's keys before being
                uploaded to the permaweb.
              </p>
              <ul className="security-list">
                <li>AES-256 encryption for file contents</li>
                <li>RSA encryption for key exchange</li>
                <li>Zero-knowledge architecture</li>
                <li>Open source and auditable</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>&copy; 2025 Enc Cloud. Built on Arweave.</p>
      </footer>
    </div>
  )
}

export default LandingPage
