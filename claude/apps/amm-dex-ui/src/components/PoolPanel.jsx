import { useState, useEffect } from 'react'

export default function PoolPanel({ dex, onPoolCreated }) {
  const [pools, setPools] = useState([])
  const [selectedPool, setSelectedPool] = useState(null)
  const [loading, setLoading] = useState(false)

  // Create pool form
  const [tokenA, setTokenA] = useState('TOKEN-A')
  const [tokenB, setTokenB] = useState('TOKEN-B')
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

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
    loadPools()
  }, [dex])

  const handleCreatePool = async () => {
    if (!dex || !amountA || !amountB) return

    setLoading(true)
    try {
      await dex.createPool(tokenA, tokenB, amountA, amountB)
      setAmountA('')
      setAmountB('')
      setShowCreateForm(false)
      await loadPools()
      onPoolCreated?.()
    } catch (err) {
      console.error('Failed to create pool:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectPool = async (poolId) => {
    if (!dex) return
    try {
      const result = await dex.getPool(poolId)
      setSelectedPool(result)
    } catch (err) {
      console.error('Failed to get pool:', err)
    }
  }

  return (
    <div className="pool-panel" data-testid="pool-panel">
      <h2>Pools</h2>

      <button
        onClick={() => setShowCreateForm(!showCreateForm)}
        data-testid="toggle-create-form"
      >
        {showCreateForm ? 'Cancel' : '+ Create Pool'}
      </button>

      {showCreateForm && (
        <div className="create-pool-form" data-testid="create-pool-form">
          <h3>Create New Pool</h3>

          <div className="input-group">
            <label>Token A</label>
            <select
              value={tokenA}
              onChange={(e) => setTokenA(e.target.value)}
              data-testid="create-token-a"
            >
              <option value="TOKEN-A">TOKEN-A</option>
              <option value="TOKEN-B">TOKEN-B</option>
              <option value="TOKEN-C">TOKEN-C</option>
            </select>
            <input
              type="number"
              value={amountA}
              onChange={(e) => setAmountA(e.target.value)}
              placeholder="Amount"
              data-testid="create-amount-a"
            />
          </div>

          <div className="input-group">
            <label>Token B</label>
            <select
              value={tokenB}
              onChange={(e) => setTokenB(e.target.value)}
              data-testid="create-token-b"
            >
              <option value="TOKEN-B">TOKEN-B</option>
              <option value="TOKEN-A">TOKEN-A</option>
              <option value="TOKEN-C">TOKEN-C</option>
            </select>
            <input
              type="number"
              value={amountB}
              onChange={(e) => setAmountB(e.target.value)}
              placeholder="Amount"
              data-testid="create-amount-b"
            />
          </div>

          <button
            onClick={handleCreatePool}
            disabled={loading || !amountA || !amountB || tokenA === tokenB}
            data-testid="create-pool-button"
          >
            {loading ? 'Creating...' : 'Create Pool'}
          </button>
        </div>
      )}

      <div className="pools-list" data-testid="pools-list">
        <h3>Active Pools ({pools.length})</h3>
        {pools.length === 0 ? (
          <p>No pools yet. Create one!</p>
        ) : (
          <ul>
            {pools.map((pool) => (
              <li
                key={pool.id}
                onClick={() => selectPool(pool.id)}
                className={selectedPool?.pool?.id === pool.id ? 'selected' : ''}
                data-testid={`pool-${pool.id}`}
              >
                <strong>{pool.id}</strong>
                <span>TVL: {pool.reserveA + pool.reserveB}</span>
                <span>Swaps: {pool.swapCount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedPool && (
        <div className="pool-details" data-testid="pool-details">
          <h3>Pool Details</h3>
          <p><strong>ID:</strong> {selectedPool.pool?.id}</p>
          <p><strong>Token A:</strong> {selectedPool.pool?.tokenA}</p>
          <p><strong>Token B:</strong> {selectedPool.pool?.tokenB}</p>
          <p><strong>Reserve A:</strong> {selectedPool.pool?.reserveA}</p>
          <p><strong>Reserve B:</strong> {selectedPool.pool?.reserveB}</p>
          <p><strong>Price:</strong> {selectedPool.price?.toFixed(6)}</p>
          <p><strong>TVL:</strong> {selectedPool.tvl}</p>
          <p><strong>Total Liquidity:</strong> {selectedPool.pool?.totalLiquidity}</p>
        </div>
      )}

      <button onClick={loadPools} data-testid="refresh-pools">
        Refresh
      </button>
    </div>
  )
}
