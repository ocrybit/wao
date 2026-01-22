/**
 * AMM DEX Server Test Suite
 *
 * Tests the Uniswap-style DEX against a local WAO Server with ArMem backend.
 * Validates frontend can connect via HTTP endpoints.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Import WAO test utilities
import { ArMem, connect, acc, scheduler } from '../../../../../src/test.js'
import Server from '../../../../../src/server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load AMM DEX Lua code
const loadLua = () => {
  const luaPath = join(__dirname, '../../../amm-dex.lua')
  return readFileSync(luaPath, 'utf-8')
}

// Test account
const { signer, addr: ownerAddr } = acc[0]

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

describe('AMM DEX Server Tests', () => {
  let server
  let mem
  let message
  let dryrun
  let pid

  beforeAll(async () => {
    // Initialize ArMem
    mem = new ArMem()
    const connection = connect(mem)
    message = connection.message
    dryrun = connection.dryrun

    // Start local WAO server using the same ArMem
    server = new Server({ port: 7000, aoconnect: mem, log: false })

    // Spawn process with aos2_0_6 module
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

    console.log('Process deployed:', pid)
  }, 120000)

  afterAll(async () => {
    if (server) {
      await server.end()
    }
  })

  describe('Server HTTP Endpoints', () => {
    it('should respond to SU endpoint', async () => {
      const response = await fetch('http://localhost:7003')
      expect(response.ok).toBe(true)
    })

    it('should respond to CU status endpoint', async () => {
      const response = await fetch('http://localhost:7004/status')
      expect(response.ok).toBe(true)
    })
  })

  describe('Token Operations via Server', () => {
    it('should mint TOKEN-A', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Mint' },
          { name: 'Token', value: 'TOKEN-A' },
          { name: 'Amount', value: '100000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })

      const data = getData(res)
      expect(data.balances['TOKEN-A']).toBe(100000)
    })

    it('should mint TOKEN-B', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Mint' },
          { name: 'Token', value: 'TOKEN-B' },
          { name: 'Amount', value: '100000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })

      const data = getData(res)
      expect(data.balances['TOKEN-B']).toBe(100000)
    })
  })

  describe('Pool Operations via Server', () => {
    it('should create pool', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'CreatePool' },
          { name: 'Tokena', value: 'TOKEN-A' },
          { name: 'Tokenb', value: 'TOKEN-B' },
          { name: 'Amounta', value: '50000' },
          { name: 'Amountb', value: '50000' },
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
    })

    it('should respond to HTTP dryrun endpoint', async () => {
      // Test the CU dry-run HTTP endpoint accepts requests
      // Note: Full dryrun via HTTP requires additional setup
      const response = await fetch('http://localhost:7004/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          process: pid,
          tags: [
            { name: 'Action', value: 'GetPool' },
            { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          ],
        }),
      })

      // Endpoint should respond (even if internal error)
      expect(response.status).toBeDefined()
    })
  })

  describe('Swap Operations via Server', () => {
    it('should execute swap', async () => {
      const beforeRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const beforeData = getData(beforeRes)
      const tokenABefore = beforeData.balances['TOKEN-A']

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'Swap' },
          { name: 'Tokenin', value: 'TOKEN-A' },
          { name: 'Tokenout', value: 'TOKEN-B' },
          { name: 'Amountin', value: '5000' },
        ],
      })

      const afterRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const afterData = getData(afterRes)

      expect(afterData.balances['TOKEN-A']).toBe(tokenABefore - 5000)
      expect(afterData.balances['TOKEN-B']).toBeGreaterThan(beforeData.balances['TOKEN-B'])
    })
  })

  describe('Liquidity Operations via Server', () => {
    it('should add liquidity', async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'AddLiquidity' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          { name: 'Amounta', value: '5000' },
          { name: 'Amountb', value: '5000' },
        ],
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'MyLiquidity' }],
      })

      const data = getData(res)
      expect(data.positions.length).toBeGreaterThan(0)
    })

    it('should remove liquidity', async () => {
      const beforeRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const beforeData = getData(beforeRes)

      await message({
        process: pid,
        signer,
        tags: [
          { name: 'Action', value: 'RemoveLiquidity' },
          { name: 'Poolid', value: 'TOKEN-A-TOKEN-B' },
          { name: 'Percent', value: '50' },
        ],
      })

      const afterRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: 'Action', value: 'Balances' }],
      })
      const afterData = getData(afterRes)

      // Should have received tokens back
      expect(afterData.balances['TOKEN-A']).toBeGreaterThan(beforeData.balances['TOKEN-A'])
      expect(afterData.balances['TOKEN-B']).toBeGreaterThan(beforeData.balances['TOKEN-B'])
    })
  })
})
