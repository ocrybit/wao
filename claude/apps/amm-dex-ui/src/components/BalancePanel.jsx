import { useState, useEffect } from 'react'

export default function BalancePanel({ dex, onMint }) {
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(false)
  const [mintToken, setMintToken] = useState('TOKEN-A')
  const [mintAmount, setMintAmount] = useState('100000')

  const loadBalances = async () => {
    if (!dex) return
    try {
      const result = await dex.getBalances()
      setBalances(result.balances || {})
    } catch (err) {
      console.error('Failed to load balances:', err)
    }
  }

  useEffect(() => {
    loadBalances()
  }, [dex])

  const handleMint = async () => {
    if (!dex || !mintToken || !mintAmount) return

    setLoading(true)
    try {
      await dex.mint(mintToken, mintAmount)
      await loadBalances()
      onMint?.()
    } catch (err) {
      console.error('Failed to mint:', err)
    } finally {
      setLoading(false)
    }
  }

  const tokenList = Object.entries(balances)

  return (
    <div className="balance-panel" data-testid="balance-panel">
      <h2>Balances</h2>

      <div className="balances-list" data-testid="balances-list">
        {tokenList.length === 0 ? (
          <p>No tokens. Mint some!</p>
        ) : (
          <ul>
            {tokenList.map(([token, amount]) => (
              <li key={token} data-testid={`balance-${token}`}>
                <span className="token-name">{token}</span>
                <span className="token-amount">{amount.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mint-form" data-testid="mint-form">
        <h3>Mint Test Tokens</h3>
        <div className="input-group">
          <select
            value={mintToken}
            onChange={(e) => setMintToken(e.target.value)}
            data-testid="mint-token"
          >
            <option value="TOKEN-A">TOKEN-A</option>
            <option value="TOKEN-B">TOKEN-B</option>
            <option value="TOKEN-C">TOKEN-C</option>
          </select>
          <input
            type="number"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder="Amount"
            data-testid="mint-amount"
          />
          <button
            onClick={handleMint}
            disabled={loading}
            data-testid="mint-button"
          >
            {loading ? 'Minting...' : 'Mint'}
          </button>
        </div>
      </div>

      <button onClick={loadBalances} data-testid="refresh-balances">
        Refresh
      </button>
    </div>
  )
}
