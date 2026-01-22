import { useState, useEffect } from 'react'

export default function SwapPanel({ dex, onSwapComplete }) {
  const [tokenIn, setTokenIn] = useState('TOKEN-A')
  const [tokenOut, setTokenOut] = useState('TOKEN-B')
  const [amountIn, setAmountIn] = useState('')
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Get quote when inputs change
  useEffect(() => {
    const getQuote = async () => {
      if (!dex || !amountIn || Number(amountIn) <= 0) {
        setQuote(null)
        return
      }

      try {
        const result = await dex.getQuote(tokenIn, tokenOut, amountIn)
        if (result.amountOut) {
          setQuote(result)
          setError(null)
        }
      } catch (err) {
        setQuote(null)
      }
    }

    const timer = setTimeout(getQuote, 300)
    return () => clearTimeout(timer)
  }, [dex, tokenIn, tokenOut, amountIn])

  const handleSwap = async () => {
    if (!dex || !amountIn) return

    setLoading(true)
    setError(null)

    try {
      const minOut = quote ? Math.floor(quote.amountOut * 0.99) : 0 // 1% slippage
      await dex.swap(tokenIn, tokenOut, amountIn, minOut)
      setAmountIn('')
      setQuote(null)
      onSwapComplete?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchTokens = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setAmountIn('')
    setQuote(null)
  }

  return (
    <div className="swap-panel" data-testid="swap-panel">
      <h2>Swap</h2>

      <div className="input-group">
        <label>From</label>
        <div className="token-input">
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.0"
            data-testid="amount-in"
          />
          <select
            value={tokenIn}
            onChange={(e) => setTokenIn(e.target.value)}
            data-testid="token-in"
          >
            <option value="TOKEN-A">TOKEN-A</option>
            <option value="TOKEN-B">TOKEN-B</option>
          </select>
        </div>
      </div>

      <button
        className="switch-btn"
        onClick={switchTokens}
        data-testid="switch-tokens"
      >
        ↕
      </button>

      <div className="input-group">
        <label>To</label>
        <div className="token-input">
          <input
            type="text"
            value={quote ? quote.amountOut : ''}
            readOnly
            placeholder="0.0"
            data-testid="amount-out"
          />
          <select
            value={tokenOut}
            onChange={(e) => setTokenOut(e.target.value)}
            data-testid="token-out"
          >
            <option value="TOKEN-B">TOKEN-B</option>
            <option value="TOKEN-A">TOKEN-A</option>
          </select>
        </div>
      </div>

      {quote && (
        <div className="quote-info" data-testid="quote-info">
          <p>Rate: 1 {tokenIn} = {(quote.amountOut / Number(amountIn)).toFixed(4)} {tokenOut}</p>
          <p>Price Impact: {(quote.priceImpact / 100).toFixed(2)}%</p>
          <p>Fee: {quote.fee} {tokenIn}</p>
        </div>
      )}

      {error && <p className="error" data-testid="error">{error}</p>}

      <button
        className="swap-btn"
        onClick={handleSwap}
        disabled={loading || !quote}
        data-testid="swap-button"
      >
        {loading ? 'Swapping...' : 'Swap'}
      </button>
    </div>
  )
}
