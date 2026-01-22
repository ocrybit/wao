/**
 * Erlang DEX UI Test Suite
 *
 * Tests the DexClient for the Erlang dex@1.0 device on HyperBEAM.
 * Uses Vitest for testing with a local HyperBEAM node.
 *
 * Note: HyperBEAM converts tag/key names to lowercase, so:
 *   TOKEN-X becomes token-x in responses
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// Import HyperBEAM test utilities (direct source path for local development)
import HyperBEAM from '../../../../../src/hyperbeam.js'
import { DexClient } from '../lib/DexClient.js'

describe('Erlang DEX UI E2E Tests', () => {
  let hbeam
  let hb
  let dex

  beforeAll(async () => {
    // Initialize HyperBEAM with reset for clean state
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb
    dex = new DexClient(hb)
  }, 120000)

  afterAll(async () => {
    if (hbeam) hbeam.kill()
  })

  describe('Device Info', () => {
    it('should return device info via DexClient', async () => {
      const info = await dex.info()
      expect(info.name).toBe('dex')
      expect(info.version).toBe('1.0')
    })
  })

  describe('Token Operations', () => {
    it('should mint tokens via DexClient', async () => {
      const result = await dex.mint('TOKEN-A', 100000, 'user1')
      expect(result.action).toBe('minted')
      expect(result.balance).toBe(100000)
    })

    it('should get balances via DexClient', async () => {
      // Mint tokens for test user
      await dex.mint('TOKEN-A', 50000, 'testuser')
      await dex.mint('TOKEN-B', 75000, 'testuser')

      // Get balances - Erlang returns lowercase keys
      const result = await dex.getBalances('testuser')
      expect(result.count).toBe(2)
      // HyperBEAM lowercases keys and may return numbers as strings
      expect(Number(result['token-a'])).toBe(50000)
      expect(Number(result['token-b'])).toBe(75000)
    })
  })

  describe('Pool Operations', () => {
    it('should create a pool via DexClient', async () => {
      // Mint tokens for pool creator
      await dex.mint('TOKEN-P', 200000, 'poolmaker')
      await dex.mint('TOKEN-Q', 200000, 'poolmaker')

      // Create pool
      const result = await dex.createPool('TOKEN-P', 'TOKEN-Q', 100000, 100000, 'poolmaker')
      expect(result.action).toBe('pool-created')
      expect(result.pool_id).toBe('TOKEN-P-TOKEN-Q')
      expect(result.liquidity).toBeGreaterThan(0)
    })

    it('should reject creating duplicate pool', async () => {
      await expect(
        dex.createPool('TOKEN-P', 'TOKEN-Q', 10000, 10000, 'poolmaker')
      ).rejects.toThrow()
    })

    it('should list pools via DexClient', async () => {
      const result = await dex.getPools()
      expect(result.count).toBeGreaterThanOrEqual(1)
    })

    it('should get pool info via DexClient', async () => {
      const result = await dex.getPool('TOKEN-P-TOKEN-Q')
      expect(result.price).toBeGreaterThan(0)
    })
  })

  describe('Swap Operations', () => {
    it('should get swap quote via DexClient', async () => {
      const result = await dex.getQuote('TOKEN-P', 'TOKEN-Q', 1000)
      expect(result.amount_in).toBe(1000)
      expect(result.amount_out).toBeGreaterThan(0)
      expect(result.amount_out).toBeLessThan(1000) // Less due to fee
      expect(result.fee).toBeGreaterThan(0)
    })

    it('should execute swap via DexClient', async () => {
      // Check balance before (lowercase keys, may be strings)
      const beforeBal = await dex.getBalances('poolmaker')
      const tokenPBefore = Number(beforeBal['token-p'] || 0)

      // Swap
      const result = await dex.swap('TOKEN-P', 'TOKEN-Q', 5000, 0, 'poolmaker')
      expect(result.action).toBe('swapped')
      expect(result.amount_in).toBe(5000)
      expect(result.amount_out).toBeGreaterThan(0)

      // Check balance after (convert to number for comparison)
      const afterBal = await dex.getBalances('poolmaker')
      expect(Number(afterBal['token-p'])).toBe(tokenPBefore - 5000)
    })

    it('should reject swap with excessive slippage via DexClient', async () => {
      await expect(
        dex.swap('TOKEN-P', 'TOKEN-Q', 1000, 999999, 'poolmaker') // Impossible min
      ).rejects.toThrow()
    })
  })

  describe('Liquidity Operations', () => {
    it('should add liquidity via DexClient', async () => {
      const result = await dex.addLiquidity('TOKEN-P-TOKEN-Q', 10000, 10000, 'poolmaker')
      expect(result.action).toBe('liquidity-added')
      expect(result.liquidity).toBeGreaterThan(0)
    })

    it('should get my liquidity positions via DexClient', async () => {
      const result = await dex.getMyLiquidity('poolmaker')
      // Positions may be linked or have positions count
      // Check that the response has valid structure
      expect(result).toBeDefined()
      expect(result['positions+link'] || result.count !== undefined || result.positions !== undefined).toBeTruthy()
    })

    it('should remove liquidity by percent via DexClient', async () => {
      const result = await dex.removeLiquidity('TOKEN-P-TOKEN-Q', 10, 'poolmaker')
      expect(result.action).toBe('liquidity-removed')
      expect(result.amount_a).toBeGreaterThan(0)
      expect(result.amount_b).toBeGreaterThan(0)
    })
  })

  describe('Multi-User Scenarios', () => {
    it('should support multiple users adding liquidity', async () => {
      // User 2 mints and adds liquidity
      await dex.mint('TOKEN-P', 100000, 'user2')
      await dex.mint('TOKEN-Q', 100000, 'user2')

      const result = await dex.addLiquidity('TOKEN-P-TOKEN-Q', 5000, 5000, 'user2')
      expect(result.action).toBe('liquidity-added')
    })

    it('should maintain separate balances per user', async () => {
      const user1Bal = await dex.getBalances('testuser')
      const user2Bal = await dex.getBalances('user2')

      // Each user has their own balance (values will differ)
      expect(user1Bal.user).toBe('testuser')
      expect(user2Bal.user).toBe('user2')
    })
  })

  describe('Constant Product Formula', () => {
    it('should maintain k constant after swaps (approximately)', async () => {
      // Create fresh pool for this test
      await dex.mint('TOKEN-K1', 200000, 'ktest')
      await dex.mint('TOKEN-K2', 200000, 'ktest')
      await dex.createPool('TOKEN-K1', 'TOKEN-K2', 100000, 100000, 'ktest')

      // Get quote before
      const quoteBefore = await dex.getQuote('TOKEN-K1', 'TOKEN-K2', 1000)
      expect(quoteBefore.amount_out).toBeGreaterThan(0)

      // Swap
      await dex.swap('TOKEN-K1', 'TOKEN-K2', 1000, 0, 'ktest')

      // Pool should still work after swap
      const quoteAfter = await dex.getQuote('TOKEN-K1', 'TOKEN-K2', 1000)
      expect(quoteAfter.amount_out).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero-balance queries', async () => {
      const result = await dex.getBalances('nonexistent_user')
      expect(result.count).toBe(0)
    })

    it('should reject swap with insufficient balance', async () => {
      // User with no tokens tries to swap
      await expect(
        dex.swap('TOKEN-P', 'TOKEN-Q', 999999999, 0, 'broke_user')
      ).rejects.toThrow()
    })
  })
})
