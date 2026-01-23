import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { WalletProvider } from '../hooks/useWallet'
import WalletConnect from '../components/WalletConnect'
import LandingPage from '../components/LandingPage'
import Dashboard from '../components/Dashboard'
import App from '../App'
import { resetWalletMock, removeWalletMock, createWalletMock } from './setup'

// Helper to render with providers
const renderWithProviders = (ui, { route = '/' } = {}) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <WalletProvider>
        {ui}
      </WalletProvider>
    </MemoryRouter>
  )
}

describe('WalletConnect Component', () => {
  beforeEach(() => {
    resetWalletMock()
  })

  describe('when wallet is not installed', () => {
    beforeEach(() => {
      removeWalletMock()
    })

    it('should show install ArConnect button', () => {
      renderWithProviders(<WalletConnect />)

      expect(screen.getByText('Install ArConnect')).toBeInTheDocument()
      expect(screen.getByText('ArConnect wallet is required to use Enc Cloud')).toBeInTheDocument()
    })

    it('should link to ArConnect website', () => {
      renderWithProviders(<WalletConnect />)

      const link = screen.getByRole('link', { name: /Install ArConnect/i })
      expect(link).toHaveAttribute('href', 'https://www.arconnect.io/')
      expect(link).toHaveAttribute('target', '_blank')
    })
  })

  describe('when wallet is installed but not connected', () => {
    beforeEach(() => {
      createWalletMock({
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })
    })

    it('should show connect button', async () => {
      renderWithProviders(<WalletConnect />)

      await waitFor(() => {
        expect(screen.getByText('Connect Wallet')).toBeInTheDocument()
      })
    })

    it('should call connect when button is clicked', async () => {
      const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      createWalletMock({
        connect: vi.fn().mockResolvedValue(undefined),
        getActiveAddress: vi.fn()
          .mockRejectedValueOnce(new Error('Not connected'))
          .mockResolvedValue(mockAddress)
      })

      renderWithProviders(<WalletConnect />)

      const connectButton = await screen.findByText('Connect Wallet')
      await userEvent.click(connectButton)

      expect(window.arweaveWallet.connect).toHaveBeenCalled()
    })

    it('should show connecting state while connecting', async () => {
      createWalletMock({
        connect: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100))),
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      renderWithProviders(<WalletConnect />)

      const connectButton = await screen.findByText('Connect Wallet')
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(screen.getByText('Connecting...')).toBeInTheDocument()
      })
    })

    it('should show error message when connection fails', async () => {
      createWalletMock({
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      renderWithProviders(<WalletConnect />)

      const connectButton = await screen.findByText('Connect Wallet')
      await userEvent.click(connectButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('should allow dismissing error', async () => {
      createWalletMock({
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })

      renderWithProviders(<WalletConnect />)

      const connectButton = await screen.findByText('Connect Wallet')
      await userEvent.click(connectButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      const closeButton = screen.getByLabelText('Dismiss error')
      await userEvent.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })
    })
  })

  describe('when wallet is connected', () => {
    const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'

    beforeEach(() => {
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress)
      })
    })

    it('should show formatted address', async () => {
      renderWithProviders(<WalletConnect />)

      await waitFor(() => {
        expect(screen.getByText('xxxxxx...1234')).toBeInTheDocument()
      })
    })

    it('should show disconnect button when showDisconnect is true', async () => {
      renderWithProviders(<WalletConnect showDisconnect={true} />)

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
      })
    })

    it('should not show disconnect button by default', async () => {
      renderWithProviders(<WalletConnect />)

      await waitFor(() => {
        expect(screen.getByText('xxxxxx...1234')).toBeInTheDocument()
      })
      expect(screen.queryByText('Disconnect')).not.toBeInTheDocument()
    })

    it('should call disconnect when disconnect button is clicked', async () => {
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress),
        disconnect: vi.fn().mockResolvedValue(undefined)
      })

      renderWithProviders(<WalletConnect showDisconnect={true} />)

      const disconnectButton = await screen.findByText('Disconnect')
      await userEvent.click(disconnectButton)

      expect(window.arweaveWallet.disconnect).toHaveBeenCalled()
    })
  })

  describe('className prop', () => {
    it('should apply custom className', () => {
      renderWithProviders(<WalletConnect className="custom-class" />)

      const container = document.querySelector('.wallet-connect')
      expect(container).toHaveClass('custom-class')
    })
  })
})

describe('LandingPage Component', () => {
  beforeEach(() => {
    resetWalletMock()
    createWalletMock({
      getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
    })
  })

  it('should render hero section', async () => {
    renderWithProviders(<LandingPage />)

    expect(screen.getByText(/Secure, Decentralized/i)).toBeInTheDocument()
    expect(screen.getByText(/Cloud Storage/i)).toBeInTheDocument()
  })

  it('should render wallet connect button', async () => {
    renderWithProviders(<LandingPage />)

    await waitFor(() => {
      expect(screen.getByText('Connect Wallet')).toBeInTheDocument()
    })
  })

  it('should render features section', () => {
    renderWithProviders(<LandingPage />)

    expect(screen.getByText('Why Enc Cloud?')).toBeInTheDocument()
    expect(screen.getByText('End-to-End Encrypted')).toBeInTheDocument()
    expect(screen.getByText('Permanent Storage')).toBeInTheDocument()
    expect(screen.getByText('Censorship Resistant')).toBeInTheDocument()
    expect(screen.getByText('Decentralized')).toBeInTheDocument()
  })

  it('should render security section', () => {
    renderWithProviders(<LandingPage />)

    expect(screen.getByText('Security First')).toBeInTheDocument()
    expect(screen.getByText('AES-256 encryption for file contents')).toBeInTheDocument()
  })

  it('should render navigation links', () => {
    renderWithProviders(<LandingPage />)

    expect(screen.getByText('Features')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('Pricing')).toBeInTheDocument()
  })

  it('should render logo', () => {
    renderWithProviders(<LandingPage />)

    expect(screen.getByText('Enc Cloud')).toBeInTheDocument()
  })

  it('should render footer', () => {
    renderWithProviders(<LandingPage />)

    expect(screen.getByText(/Built on Arweave/i)).toBeInTheDocument()
  })
})

describe('Dashboard Component', () => {
  const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'

  beforeEach(() => {
    resetWalletMock()
  })

  describe('when connected', () => {
    beforeEach(() => {
      createWalletMock({
        getActiveAddress: vi.fn().mockResolvedValue(mockAddress),
        disconnect: vi.fn().mockResolvedValue(undefined)
      })
    })

    it('should render welcome message with address', async () => {
      renderWithProviders(<Dashboard />, { route: '/dashboard' })

      await waitFor(() => {
        expect(screen.getByText('Welcome to Enc Cloud')).toBeInTheDocument()
      })

      // Check the address is displayed (in header or welcome section)
      await waitFor(() => {
        const addressElements = screen.getAllByText(/xxxxxx.*1234/)
        expect(addressElements.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
    })

    it('should render files section', async () => {
      renderWithProviders(<Dashboard />, { route: '/dashboard' })

      await waitFor(() => {
        expect(screen.getByText('Your Files')).toBeInTheDocument()
        expect(screen.getByText('No files yet')).toBeInTheDocument()
      })
    })

    it('should render upload button', async () => {
      renderWithProviders(<Dashboard />, { route: '/dashboard' })

      await waitFor(() => {
        expect(screen.getByText('Upload Files')).toBeInTheDocument()
      })
    })

    it('should render storage stats', async () => {
      renderWithProviders(<Dashboard />, { route: '/dashboard' })

      await waitFor(() => {
        expect(screen.getByText('Storage Stats')).toBeInTheDocument()
        expect(screen.getByText('Files')).toBeInTheDocument()
        expect(screen.getByText('Used')).toBeInTheDocument()
        expect(screen.getByText('Last Upload')).toBeInTheDocument()
      })
    })

    it('should render sign out button', async () => {
      renderWithProviders(<Dashboard />, { route: '/dashboard' })

      await waitFor(() => {
        expect(screen.getByText('Sign Out')).toBeInTheDocument()
      })
    })

    it('should disconnect when sign out is clicked', async () => {
      renderWithProviders(<Dashboard />, { route: '/dashboard' })

      const signOutButton = await screen.findByText('Sign Out')
      await userEvent.click(signOutButton)

      expect(window.arweaveWallet.disconnect).toHaveBeenCalled()
    })

    it('should show wallet connect with disconnect option', async () => {
      renderWithProviders(<Dashboard />, { route: '/dashboard' })

      await waitFor(() => {
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
      })
    })
  })

  describe('when not connected', () => {
    beforeEach(() => {
      createWalletMock({
        getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
      })
    })

    it('should redirect to landing page', async () => {
      const { container } = renderWithProviders(<Dashboard />, { route: '/dashboard' })

      // Dashboard should not render its content
      await waitFor(() => {
        expect(screen.queryByText('Welcome to Enc Cloud')).not.toBeInTheDocument()
      })
    })
  })
})

describe('App Component', () => {
  beforeEach(() => {
    resetWalletMock()
  })

  it('should render landing page at root route', async () => {
    createWalletMock({
      getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Secure, Decentralized/i)).toBeInTheDocument()
    })
  })

  it('should render dashboard at /dashboard route when connected', async () => {
    const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
    createWalletMock({
      getActiveAddress: vi.fn().mockResolvedValue(mockAddress)
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Welcome to Enc Cloud')).toBeInTheDocument()
    })
  })

  it('should wrap app in WalletProvider', () => {
    createWalletMock({
      getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
    })

    // This test verifies that wallet context is available
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    // If WalletProvider is not present, this would throw
    expect(screen.getByText('Connect Wallet')).toBeDefined
  })
})

describe('Wallet Integration', () => {
  const mockAddress = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'

  beforeEach(() => {
    resetWalletMock()
  })

  it('should navigate to dashboard after successful connection', async () => {
    createWalletMock({
      connect: vi.fn().mockResolvedValue(undefined),
      getActiveAddress: vi.fn()
        .mockRejectedValueOnce(new Error('Not connected'))
        .mockResolvedValue(mockAddress)
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    const connectButton = await screen.findByText('Connect Wallet')
    await userEvent.click(connectButton)

    await waitFor(() => {
      expect(screen.getByText('Welcome to Enc Cloud')).toBeInTheDocument()
    })
  })

  it('should navigate to landing page after disconnect', async () => {
    createWalletMock({
      getActiveAddress: vi.fn().mockResolvedValue(mockAddress),
      disconnect: vi.fn().mockImplementation(() => {
        // Simulate disconnect by making getActiveAddress fail
        window.arweaveWallet.getActiveAddress = vi.fn().mockRejectedValue(new Error('Not connected'))
        return Promise.resolve()
      })
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    const signOutButton = await screen.findByText('Sign Out')
    await userEvent.click(signOutButton)

    await waitFor(() => {
      expect(screen.getByText(/Secure, Decentralized/i)).toBeInTheDocument()
    })
  })
})

describe('Accessibility', () => {
  beforeEach(() => {
    resetWalletMock()
    createWalletMock({
      getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
    })
  })

  it('should have accessible button labels', async () => {
    renderWithProviders(<WalletConnect />)

    const connectButton = await screen.findByText('Connect Wallet')
    expect(connectButton).toHaveAccessibleName()
  })

  it('should have accessible error alerts', async () => {
    createWalletMock({
      connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
      getActiveAddress: vi.fn().mockRejectedValue(new Error('Not connected'))
    })

    renderWithProviders(<WalletConnect />)

    const connectButton = await screen.findByText('Connect Wallet')
    await userEvent.click(connectButton)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
    })
  })

  it('should have accessible navigation links', () => {
    renderWithProviders(<LandingPage />)

    const featuresLink = screen.getByText('Features')
    const securityLink = screen.getByText('Security')
    const pricingLink = screen.getByText('Pricing')

    expect(featuresLink.closest('a')).toHaveAttribute('href', '#features')
    expect(securityLink.closest('a')).toHaveAttribute('href', '#security')
    expect(pricingLink.closest('a')).toHaveAttribute('href', '#pricing')
  })
})
