import { useState, useEffect } from 'react'
import SwapPanel from './components/SwapPanel'
import PoolPanel from './components/PoolPanel'
import LiquidityPanel from './components/LiquidityPanel'
import BalancePanel from './components/BalancePanel'
import './App.css'

function App({ dexClient }) {
  const [dex, setDex] = useState(dexClient || null)
  const [pools, setPools] = useState([])
  const [activeTab, setActiveTab] = useState('swap')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (dexClient) {
      setDex(dexClient)
      setConnected(true)
    }
  }, [dexClient])

  const loadPools = async () => {
    if (!dex) return
    try {
      const result = await dex.getPools()
      setPools(result.pools || [])
    } catch (err) {
      console.error('Failed to load pools:', err)
    }
  }

  useEffect(() => {
    if (dex) {
      loadPools()
    }
  }, [dex])

  const handleStateChange = () => {
    loadPools()
  }

  return (
    <div className="app" data-testid="app">
      <header className="header">
        <h1>Erlang DEX</h1>
        <div className="connection-status" data-testid="connection-status">
          {connected ? (
            <span className="connected">Connected to HyperBEAM</span>
          ) : (
            <span className="disconnected">Not Connected</span>
          )}
        </div>
      </header>

      <nav className="tabs">
        <button
          className={activeTab === 'swap' ? 'active' : ''}
          onClick={() => setActiveTab('swap')}
          data-testid="tab-swap"
        >
          Swap
        </button>
        <button
          className={activeTab === 'pools' ? 'active' : ''}
          onClick={() => setActiveTab('pools')}
          data-testid="tab-pools"
        >
          Pools
        </button>
        <button
          className={activeTab === 'liquidity' ? 'active' : ''}
          onClick={() => setActiveTab('liquidity')}
          data-testid="tab-liquidity"
        >
          Liquidity
        </button>
        <button
          className={activeTab === 'balances' ? 'active' : ''}
          onClick={() => setActiveTab('balances')}
          data-testid="tab-balances"
        >
          Balances
        </button>
      </nav>

      <main className="main-content">
        {!connected ? (
          <div className="not-connected" data-testid="not-connected">
            <p>Please connect to a HyperBEAM node to use the DEX.</p>
          </div>
        ) : (
          <>
            {activeTab === 'swap' && (
              <SwapPanel dex={dex} onSwapComplete={handleStateChange} />
            )}
            {activeTab === 'pools' && (
              <PoolPanel dex={dex} onPoolCreated={handleStateChange} />
            )}
            {activeTab === 'liquidity' && (
              <LiquidityPanel
                dex={dex}
                pools={pools}
                onLiquidityChange={handleStateChange}
              />
            )}
            {activeTab === 'balances' && (
              <BalancePanel dex={dex} onMint={handleStateChange} />
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p>Powered by HyperBEAM Erlang Device</p>
      </footer>
    </div>
  )
}

export default App
