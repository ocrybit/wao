/**
 * DexClient for HyperBEAM Erlang DEX Device
 *
 * Connects to HyperBEAM's dex@1.0 device via HTTP API.
 * Unlike Lua processes, this uses direct HTTP endpoints.
 */

export class DexClient {
  constructor(hb) {
    this.hb = hb
  }

  // ========== Device Info ==========

  /**
   * Get device info
   */
  async info() {
    return this.hb.g('/~dex@1.0/info')
  }

  // ========== Token Operations ==========

  /**
   * Mint test tokens
   * @param {string} token - Token name (e.g., "TOKEN-A")
   * @param {number} amount - Amount to mint
   * @param {string} [from] - Optional address (defaults to node operator)
   */
  async mint(token, amount, from) {
    const params = { token, amount }
    if (from) params.from = from
    return this.hb.p('/~dex@1.0/mint', params)
  }

  /**
   * Get user balances
   * Note: HyperBEAM returns lowercase keys (token-a instead of TOKEN-A)
   * @param {string} [from] - Optional address (defaults to node operator)
   */
  async getBalances(from) {
    const params = from ? { from } : {}
    return this.hb.g('/~dex@1.0/balances', params)
  }

  // ========== Pool Operations ==========

  /**
   * Create a new liquidity pool
   */
  async createPool(tokenA, tokenB, amountA, amountB, from) {
    const params = {
      tokena: tokenA,
      tokenb: tokenB,
      amounta: amountA,
      amountb: amountB,
    }
    if (from) params.from = from
    return this.hb.p('/~dex@1.0/create_pool', params)
  }

  /**
   * Get all pools
   */
  async getPools() {
    return this.hb.g('/~dex@1.0/pools')
  }

  /**
   * Get pool info by ID
   */
  async getPool(poolId) {
    return this.hb.g('/~dex@1.0/pool', { poolid: poolId })
  }

  // ========== Swap Operations ==========

  /**
   * Get swap quote
   */
  async getQuote(tokenIn, tokenOut, amountIn) {
    return this.hb.g('/~dex@1.0/quote', {
      tokenin: tokenIn,
      tokenout: tokenOut,
      amountin: amountIn,
    })
  }

  /**
   * Execute a swap
   */
  async swap(tokenIn, tokenOut, amountIn, minAmountOut = 0, from) {
    const params = {
      tokenin: tokenIn,
      tokenout: tokenOut,
      amountin: amountIn,
      minamountout: minAmountOut,
    }
    if (from) params.from = from
    return this.hb.p('/~dex@1.0/swap', params)
  }

  // ========== Liquidity Operations ==========

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(poolId, amountA, amountB, from) {
    const params = {
      poolid: poolId,
      amounta: amountA,
      amountb: amountB,
    }
    if (from) params.from = from
    return this.hb.p('/~dex@1.0/add_liquidity', params)
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(poolId, percent, from) {
    const params = {
      poolid: poolId,
      percent,
    }
    if (from) params.from = from
    return this.hb.p('/~dex@1.0/remove_liquidity', params)
  }

  /**
   * Get user's liquidity positions
   */
  async getMyLiquidity(from) {
    const params = from ? { from } : {}
    return this.hb.g('/~dex@1.0/my_liquidity', params)
  }
}

export default DexClient
