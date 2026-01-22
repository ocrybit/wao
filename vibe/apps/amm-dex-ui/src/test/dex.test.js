/**
 * AMM DEX Comprehensive Test Suite
 *
 * Tests the Uniswap-style DEX using WAO ArMem (in-memory WASM).
 * Connects to a standalone process and tests all operations.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Import WAO test utilities (direct source path for local development)
import { ArMem, connect, acc, scheduler } from '../../../../../src/test.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load AMM DEX Lua code
const loadLua = () => {
  const luaPath = join(__dirname, '../../../amm-dex.lua')
  return readFileSync(luaPath, 'utf-8')
}

// Test accounts
const { signer, addr: ownerAddr } = acc[0]
const { signer: signer2, addr: user2Addr } = acc[1]

// Helper to parse response data
const getData = (res) => {
  if (res.Messages?.[0]?.Data) {
    try {
      return JSON.parse(res.Messages[0].Data)
    } catch {
      return res.Messages[0].Data
    }
  }
  return null
}

// Helper to check for errors
const hasError = (res) => {
  const tags = res.Messages?.[0]?.Tags || []
  return tags.some((t) => t.name === 'Error' || t.name === 'error')
}

describe('AMM DEX E2E Tests', () => {
  let mem
  let pid
  let message
  let dryrun

  beforeAll(async () => {
    // Initialize ArMem with aos2_0_6 WASM module
    mem = new ArMem()
    const connection = connect(mem)
    message = connection.message
    dryrun = connection.dryrun

    // Spawn process with WASM module
    pid = await connection.spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_6,
    })

    // Load AMM DEX code
    const src = loadLua()
    await message({
      process: pid,
      signer,
      tags: [{ name: 'Action', value: 'Eval' }],
      data: src,
    })
  }, 60000)

  describe('Token Minting', () => {
    it('should mint TOKEN-A for owner', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Mint' },
          { name: 'Token', value: 'TOKEN-A' },
          { name: 'Amount', value: '1000000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })

      const data = getData(res)
      expect(data.balances['TOKEN-A']).toBe(1000000)
    })

    it('should mint TOKEN-B for owner', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Mint' },
          { name: 'Token', value: 'TOKEN-B' },
          { name: 'Amount', value: '1000000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })

      const data = getData(res)
      expect(data.balances['TOKEN-B']).toBe(1000000)
    })

    it('should mint TOKEN-C for testing multiple pools', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Mint' },
          { name: 'Token', value: 'TOKEN-C' },
          { name: 'Amount', value: '500000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })

      const data = getData(res)
      expect(data.balances['TOKEN-C']).toBe(500000)
    })

    it('should mint tokens for second user', async () => {
      await message({
        process: pid,
        signer: signer2,
        tags: [
          { name: 'Action', value: 'Mint' },
          { name: 'Token', value: 'TOKEN-A' },
          { name: 'Amount', value: '500000' },
        ],
      })

      await message({
        process: pid,
        signer: signer2,
        tags: [
          { name: 'Action', value: 'Mint' },
          { name: 'Token', value: 'TOKEN-B' },
          { name: 'Amount', value: '500000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer: signer2,
        tags: [{ name: 'Action', value: 'Balances' }],
      })

      const data = getData(res)
      expect(data.balances['TOKEN-A']).toBe(500000)
      expect(data.balances['TOKEN-B']).toBe(500000)
    })
  })

  describe('Pool Creation', () => {
    it('should create TOKEN-A/TOKEN-B pool', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'CreatePool' },
          { name: 'Tokena', value: 'TOKEN-A' },
          { name: 'Tokenb', value: 'TOKEN-B' },
          { name: 'Amounta', value: '100000' },
          { name: 'Amountb', value: '100000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Pools' }],
      })

      const data = getData(res)
      expect(data.count).toBe(1)
      expect(data.pools[0].id).toBe('TOKEN-A-TOKEN-B')
      expect(data.pools[0].reserveA).toBe(100000)
      expect(data.pools[0].reserveB).toBe(100000)
    })

    it('should create TOKEN-A/TOKEN-C pool', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'CreatePool' },
          { name: 'Tokena', value: 'TOKEN-A' },
          { name: 'Tokenb', value: 'TOKEN-C' },
          { name: 'Amounta', value: '50000' },
          { name: 'Amountb', value: '100000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Pools' }],
      })

      const data = getData(res)
      expect(data.count).toBe(2)
    })

    it('should reject creating duplicate pool', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'CreatePool' },
          { name: 'Tokena', value: 'TOKEN-A' },
          { name: 'Tokenb', value: 'TOKEN-B' },
          { name: 'Amounta', value: '10000' },
          { name: 'Amountb', value: '10000' },
        ],
      })

      expect(hasError(res)).toBe(true)
    })

    it('should reject creating pool with same token', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'CreatePool' },
          { name: 'Tokena', value: 'TOKEN-A' },
          { name: 'Tokenb', value: 'TOKEN-A' },
          { name: 'Amounta', value: '10000' },
          { name: 'Amountb', value: '10000' },
        ],
      })

      expect(hasError(res)).toBe(true)
    })
  })

  describe('Pool Queries', () => {
    it('should get pool info', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetPool' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
        ],
      })

      const data = getData(res)
      expect(data.pool.id).toBe('TOKEN-A-TOKEN-B')
      expect(data.pool.tokenA).toBe('TOKEN-A')
      expect(data.pool.tokenB).toBe('TOKEN-B')
      expect(data.price).toBe(1) // 1:1 ratio
    })

    it('should list all pools', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Pools' }],
      })

      const data = getData(res)
      expect(data.count).toBe(2)
      expect(data.pools.length).toBe(2)
    })
  })

  describe('Swap Operations', () => {
    it('should get swap quote', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetQuote' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '1000' },
        ],
      })

      const data = getData(res)
      expect(data.amountIn).toBe(1000)
      expect(data.amountOut).toBeGreaterThan(0)
      expect(data.amountOut).toBeLessThan(1000) // Fee applied
      expect(data.fee).toBeGreaterThan(0)
    })

    it('should execute swap TOKEN-A -> TOKEN-B', async () => {
      const balancesBefore = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const beforeData = getData(balancesBefore)
      const tokenABefore = beforeData.balances['TOKEN-A']
      const tokenBBefore = beforeData.balances['TOKEN-B']

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Swap' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '10000' },
        ],
      })

      const balancesAfter = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const afterData = getData(balancesAfter)

      expect(afterData.balances['TOKEN-A']).toBe(tokenABefore - 10000)
      expect(afterData.balances['TOKEN-B']).toBeGreaterThan(tokenBBefore)
    })

    it('should execute swap TOKEN-B -> TOKEN-A', async () => {
      const balancesBefore = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const beforeData = getData(balancesBefore)

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Swap' },
          { name: 'Tokenin', value: 'TOKEN-B' },
          { name: 'Tokenout', value: 'TOKEN-A' },
          { name: 'Amountin', value: '5000' },
        ],
      })

      const balancesAfter = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const afterData = getData(balancesAfter)

      expect(afterData.balances['TOKEN-B']).toBe(
        beforeData.balances['TOKEN-B'] - 5000
      )
      expect(afterData.balances['TOKEN-A']).toBeGreaterThan(
        beforeData.balances['TOKEN-A']
      )
    })

    it('should respect slippage protection', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Swap' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '1000' },
          { name: 'Minamountout', value: '999999' }, // Impossible min
        ],
      })

      expect(hasError(res)).toBe(true)
    })

    it('should reject swap with insufficient balance', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Swap' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '99999999999' },
        ],
      })

      expect(hasError(res)).toBe(true)
    })

    it('should update pool state after swaps', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetPool' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
        ],
      })

      const data = getData(res)
      expect(data.pool.swapCount).toBeGreaterThan(0)
      // Reserves should have changed from initial 100k each
      expect(data.pool.reserveA).not.toBe(100000)
      expect(data.pool.reserveB).not.toBe(100000)
    })
  })

  describe('Liquidity Management', () => {
    it('should add liquidity to existing pool', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'AddLiquidity' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          { name: 'Amounta', value: '10000' },
          { name: 'Amountb', value: '10000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'MyLiquidity' }],
      })

      const data = getData(res)
      expect(data.positions.length).toBeGreaterThan(0)
      const position = data.positions.find((p) => p.poolId === 'TOKEN-A-TOKEN-B')
      expect(position).toBeDefined()
      expect(position.liquidity).toBeGreaterThan(0)
    })

    it('should allow second user to add liquidity', async () => {
      await message({
        process: pid,
        signer: signer2,
        tags: [
          { name: 'Action', value: 'AddLiquidity' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          { name: 'Amounta', value: '5000' },
          { name: 'Amountb', value: '5000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer: signer2,
        tags: [{ name: 'Action', value: 'MyLiquidity' }],
      })

      const data = getData(res)
      expect(data.positions.length).toBeGreaterThan(0)
    })

    it('should show correct liquidity share', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'MyLiquidity' }],
      })

      const data = getData(res)
      const position = data.positions.find((p) => p.poolId === 'TOKEN-A-TOKEN-B')
      expect(position.share).toBeGreaterThan(0)
      expect(position.share).toBeLessThanOrEqual(100)
    })

    it('should remove 10% of liquidity', async () => {
      const beforeRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'MyLiquidity' }],
      })
      const beforeData = getData(beforeRes)
      const beforePosition = beforeData.positions.find(
        (p) => p.poolId === 'TOKEN-A-TOKEN-B'
      )
      const beforeLiquidity = beforePosition.liquidity

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'RemoveLiquidity' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          { name: 'Percent', value: '10' },
        ],
      })

      const afterRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'MyLiquidity' }],
      })
      const afterData = getData(afterRes)
      const afterPosition = afterData.positions.find(
        (p) => p.poolId === 'TOKEN-A-TOKEN-B'
      )

      // Should have ~90% of original liquidity (allow 1 unit rounding error)
      const expectedLiquidity = Math.floor(beforeLiquidity * 0.9)
      expect(afterPosition.liquidity).toBeGreaterThanOrEqual(expectedLiquidity)
      expect(afterPosition.liquidity).toBeLessThanOrEqual(expectedLiquidity + 1)
    })

    it('should return tokens when removing liquidity', async () => {
      const balancesBefore = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const beforeData = getData(balancesBefore)

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'RemoveLiquidity' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          { name: 'Percent', value: '50' },
        ],
      })

      const balancesAfter = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const afterData = getData(balancesAfter)

      expect(afterData.balances['TOKEN-A']).toBeGreaterThan(
        beforeData.balances['TOKEN-A']
      )
      expect(afterData.balances['TOKEN-B']).toBeGreaterThan(
        beforeData.balances['TOKEN-B']
      )
    })
  })

  describe('Multi-Pool Operations', () => {
    it('should support swaps across different pools', async () => {
      // Swap TOKEN-A -> TOKEN-C using the A/C pool
      const balancesBefore = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const beforeData = getData(balancesBefore)

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Swap' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-C' },
          { name: 'Amountin', value: '1000' },
        ],
      })

      const balancesAfter = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const afterData = getData(balancesAfter)

      expect(afterData.balances['TOKEN-A']).toBe(
        beforeData.balances['TOKEN-A'] - 1000
      )
      expect(afterData.balances['TOKEN-C']).toBeGreaterThan(
        beforeData.balances['TOKEN-C']
      )
    })

    it('should maintain separate pool states', async () => {
      const poolAB = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetPool' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
        ],
      })

      const poolAC = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetPool' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-C' },
        ],
      })

      const dataAB = getData(poolAB)
      const dataAC = getData(poolAC)

      expect(dataAB.pool.id).toBe('TOKEN-A-TOKEN-B')
      expect(dataAC.pool.id).toBe('TOKEN-A-TOKEN-C')
      expect(dataAB.pool.reserveA).not.toBe(dataAC.pool.reserveA)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very small swaps', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetQuote' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '100' },  // Small but not tiny
        ],
      })

      const data = getData(res)
      // Small swaps should return some output
      expect(data).not.toBeNull()
      expect(data.amountOut).toBeGreaterThanOrEqual(0)
    })

    it('should handle large swaps with price impact', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetQuote' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '50000' },
        ],
      })

      const data = getData(res)
      // Large swaps should have higher price impact
      expect(data.priceImpact).toBeGreaterThan(0)
    })

    it('should reject operations on non-existent pools', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetPool' },
          { name: 'Poolid', value: 'NONEXISTENT-POOL' },
        ],
      })

      expect(hasError(res)).toBe(true)
    })

    it('should reject removing more liquidity than available', async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'RemoveLiquidity' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          { name: 'Liquidity', value: '99999999999' },
        ],
      })

      expect(hasError(res)).toBe(true)
    })
  })

  describe('Constant Product Formula (x*y=k)', () => {
    it('should maintain k constant after swaps (approximately)', async () => {
      const poolBefore = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetPool' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
        ],
      })
      const beforeData = getData(poolBefore)
      const kBefore = beforeData.pool.reserveA * beforeData.pool.reserveB

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Swap' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '1000' },
        ],
      })

      const poolAfter = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'GetPool' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
        ],
      })
      const afterData = getData(poolAfter)
      const kAfter = afterData.pool.reserveA * afterData.pool.reserveB

      // k should increase slightly due to fees (0.3%)
      expect(kAfter).toBeGreaterThanOrEqual(kBefore)
    })
  })
})
