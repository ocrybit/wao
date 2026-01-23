/**
 * WAO Connection Library for AMM DEX
 *
 * Connects to a standalone WAO server for process management
 */

// Default server URLs (WAO server runs on ports 4000-4004)
const DEFAULT_CONFIG = {
  MU_URL: 'http://localhost:4002',
  CU_URL: 'http://localhost:4004',
  SU_URL: 'http://localhost:4003',
  GATEWAY_URL: 'http://localhost:4000',
}

export class DexClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.processId = null
    this.signer = null
  }

  /**
   * Initialize the DEX client with a process
   */
  async init({ processId, signer }) {
    this.processId = processId
    this.signer = signer
  }

  /**
   * Send a message to the DEX process
   */
  async send(action, tags = {}, data = '') {
    const allTags = [
      { name: 'Action', value: action },
      ...Object.entries(tags).map(([name, value]) => ({
        name: name.toLowerCase(), // aos2_0_6 lowercases custom tags
        value: String(value)
      }))
    ]

    const response = await fetch(`${this.config.MU_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process: this.processId,
        tags: allTags,
        data,
      })
    })

    return response.json()
  }

  /**
   * Query state (dry run - no state changes)
   */
  async query(action, tags = {}) {
    const allTags = [
      { name: 'Action', value: action },
      ...Object.entries(tags).map(([name, value]) => ({
        name: name.toLowerCase(),
        value: String(value)
      }))
    ]

    const response = await fetch(`${this.config.CU_URL}/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process: this.processId,
        tags: allTags,
      })
    })

    const result = await response.json()

    // Parse the response data
    if (result.Messages?.[0]?.Data) {
      try {
        return JSON.parse(result.Messages[0].Data)
      } catch {
        return result.Messages[0].Data
      }
    }
    return result
  }

  // ========== DEX Operations ==========

  /**
   * Mint test tokens
   */
  async mint(token, amount) {
    return this.send('Mint', { token, amount })
  }

  /**
   * Get user balances
   */
  async getBalances() {
    return this.query('Balances')
  }

  /**
   * Create a new liquidity pool
   */
  async createPool(tokenA, tokenB, amountA, amountB) {
    return this.send('CreatePool', {
      tokena: tokenA,
      tokenb: tokenB,
      amounta: amountA,
      amountb: amountB,
    })
  }

  /**
   * Get all pools
   */
  async getPools() {
    return this.query('Pools')
  }

  /**
   * Get pool info
   */
  async getPool(poolId) {
    return this.query('GetPool', { poolid: poolId })
  }

  /**
   * Get swap quote
   */
  async getQuote(tokenIn, tokenOut, amountIn) {
    return this.query('GetQuote', {
      tokenin: tokenIn,
      tokenout: tokenOut,
      amountin: amountIn,
    })
  }

  /**
   * Execute a swap
   */
  async swap(tokenIn, tokenOut, amountIn, minAmountOut = 0) {
    return this.send('Swap', {
      tokenin: tokenIn,
      tokenout: tokenOut,
      amountin: amountIn,
      minamountout: minAmountOut,
    })
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(poolId, amountA, amountB) {
    return this.send('AddLiquidity', {
      poolid: poolId,
      amounta: amountA,
      amountb: amountB,
    })
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(poolId, percent) {
    return this.send('RemoveLiquidity', {
      poolid: poolId,
      percent,
    })
  }

  /**
   * Get user's liquidity positions
   */
  async getMyLiquidity() {
    return this.query('MyLiquidity')
  }
}

export default DexClient
