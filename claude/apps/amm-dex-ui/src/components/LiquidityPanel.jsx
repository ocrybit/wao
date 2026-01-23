import { useState, useEffect } from 'react'

export default function LiquidityPanel({ dex, pools, onLiquidityChange }) {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedPoolId, setSelectedPoolId] = useState('')
  const [addAmountA, setAddAmountA] = useState('')
  const [addAmountB, setAddAmountB] = useState('')
  const [removePercent, setRemovePercent] = useState('10')

  const loadPositions = async () => {
    if (!dex) return
    try {
      const result = await dex.getMyLiquidity()
      setPositions(result.positions || [])
    } catch (err) {
      console.error('Failed to load positions:', err)
    }
  }

  useEffect(() => {
    loadPositions()
  }, [dex])

  const handleAddLiquidity = async () => {
    if (!dex || !selectedPoolId || !addAmountA || !addAmountB) return

    setLoading(true)
    try {
      await dex.addLiquidity(selectedPoolId, addAmountA, addAmountB)
      setAddAmountA('')
      setAddAmountB('')
      await loadPositions()
      onLiquidityChange?.()
    } catch (err) {
      console.error('Failed to add liquidity:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveLiquidity = async (poolId) => {
    if (!dex || !poolId || !removePercent) return

    setLoading(true)
    try {
      await dex.removeLiquidity(poolId, removePercent)
      await loadPositions()
      onLiquidityChange?.()
    } catch (err) {
      console.error('Failed to remove liquidity:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="liquidity-panel" data-testid="liquidity-panel">
      <h2>Liquidity</h2>

      {/* Add Liquidity Form */}
      <div className="add-liquidity-form" data-testid="add-liquidity-form">
        <h3>Add Liquidity</h3>

        <div className="input-group">
          <label>Pool</label>
          <select
            value={selectedPoolId}
            onChange={(e) => setSelectedPoolId(e.target.value)}
            data-testid="select-pool"
          >
            <option value="">Select a pool</option>
            {pools?.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.id}
              </option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label>Amount A</label>
          <input
            type="number"
            value={addAmountA}
            onChange={(e) => setAddAmountA(e.target.value)}
            placeholder="0"
            data-testid="add-amount-a"
          />
        </div>

        <div className="input-group">
          <label>Amount B</label>
          <input
            type="number"
            value={addAmountB}
            onChange={(e) => setAddAmountB(e.target.value)}
            placeholder="0"
            data-testid="add-amount-b"
          />
        </div>

        <button
          onClick={handleAddLiquidity}
          disabled={loading || !selectedPoolId || !addAmountA || !addAmountB}
          data-testid="add-liquidity-button"
        >
          {loading ? 'Adding...' : 'Add Liquidity'}
        </button>
      </div>

      {/* My Positions */}
      <div className="positions-list" data-testid="positions-list">
        <h3>My Positions ({positions.length})</h3>

        {positions.length === 0 ? (
          <p>No liquidity positions yet.</p>
        ) : (
          <ul>
            {positions.map((pos) => (
              <li key={pos.poolId} data-testid={`position-${pos.poolId}`}>
                <div className="position-info">
                  <strong>{pos.poolId}</strong>
                  <p>Liquidity: {pos.liquidity}</p>
                  <p>Share: {pos.share?.toFixed(2)}%</p>
                  <p>Value A: {pos.valueA}</p>
                  <p>Value B: {pos.valueB}</p>
                </div>
                <div className="position-actions">
                  <input
                    type="number"
                    value={removePercent}
                    onChange={(e) => setRemovePercent(e.target.value)}
                    min="1"
                    max="100"
                    data-testid={`remove-percent-${pos.poolId}`}
                  />
                  <span>%</span>
                  <button
                    onClick={() => handleRemoveLiquidity(pos.poolId)}
                    disabled={loading}
                    data-testid={`remove-liquidity-${pos.poolId}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button onClick={loadPositions} data-testid="refresh-positions">
        Refresh
      </button>
    </div>
  )
}
