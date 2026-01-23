import { Routes, Route } from 'react-router-dom'
import { WalletProvider } from './hooks/useWallet'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'

function App() {
  return (
    <WalletProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </WalletProvider>
  )
}

export default App
