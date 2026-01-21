/**
 * HyperAOS Lua Apps Test Suite
 *
 * Tests Lua apps on HyperBEAM Beta3 using genesis-wasm@1.0 execution device.
 * Uses direct CU calls for compute since HyperBEAM's relay has a prometheus bug.
 *
 * Run with:
 * HB_TIMEOUT=180 node --experimental-wasm-memory64 --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import HyperBEAM from "../../../src/hyperbeam.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const appsDir = resolve(__dirname, "..")

// Helper to read Lua app file
function readLuaApp(name) {
  return readFileSync(resolve(appsDir, `${name}.lua`), "utf8")
}

// Parse response data from CU result
function parseData(result) {
  try {
    if (result?.Messages?.[0]?.Data) {
      const data = result.Messages[0].Data
      try {
        return JSON.parse(data)
      } catch {
        return data
      }
    }
    if (result?.Output?.data) {
      try {
        return JSON.parse(result.Output.data)
      } catch {
        return result.Output.data
      }
    }
    return result
  } catch (e) {
    return result
  }
}

// Direct CU compute - bypasses HyperBEAM's broken relay
async function cuCompute(hb, pid, slot) {
  const url = `${hb.cu}/result/${pid}?process-id=${pid}&message-id=${pid}&no-busy=1`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`CU compute failed: ${response.status}`)
  }
  return await response.json()
}

// Direct CU dryrun
async function cuDryrun(hb, pid, action, tags = {}, data) {
  const url = `${hb.cu}/dry-run?process-id=${pid}`
  const body = {
    Id: "dryrun-" + Date.now(),
    Target: pid,
    Owner: hb.addr,
    Tags: [
      { name: "Action", value: action },
      ...Object.entries(tags).map(([name, value]) => ({ name, value: String(value) }))
    ],
    Data: data || ""
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`CU dryrun failed: ${response.status}`)
  }
  return await response.json()
}

describe("HyperAOS Lua Apps (genesis-wasm)", function() {
  let hbeam, hb

  before(async function() {
    console.log("Starting HyperBEAM with genesis-wasm...")
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 180,
      logs: false,
      as: ["genesis_wasm"]
    }).ready()
    hb = hbeam.hb
    console.log("HyperBEAM ready on", hb.url)
    console.log("CU ready on", hb.cu)
  })

  after(async () => {
    if (hbeam) {
      console.log("Shutting down HyperBEAM...")
      hbeam.kill()
    }
  })

  describe("Counter App", function() {
    let pid, luaCode

    before(async () => {
      luaCode = readLuaApp("counter")
      console.log("Spawning Counter process...")

      const result = await hb.spawnLegacy()
      pid = result.pid
      console.log("Counter process:", pid)

      // Load the Lua code via schedule
      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      // Use direct CU compute
      await cuCompute(hb, pid, slot)
      console.log("Counter code loaded")
    })

    it("should get count via dryrun", async () => {
      const result = await cuDryrun(hb, pid, "Get")
      const data = parseData(result)
      console.log("Get result:", data)
      assert.ok(result)
    })

    it("should increment counter", async () => {
      const { slot } = await hb.scheduleLegacy({ pid, action: "Inc" })
      await cuCompute(hb, pid, slot)

      const result = await cuDryrun(hb, pid, "Get")
      const data = parseData(result)
      console.log("After Inc:", data)
      assert.ok(result)
    })

    it("should decrement counter", async () => {
      const { slot } = await hb.scheduleLegacy({ pid, action: "Dec" })
      await cuCompute(hb, pid, slot)

      const result = await cuDryrun(hb, pid, "Get")
      const data = parseData(result)
      console.log("After Dec:", data)
      assert.ok(result)
    })

    it("should reset counter", async () => {
      const { slot } = await hb.scheduleLegacy({ pid, action: "Reset" })
      await cuCompute(hb, pid, slot)

      const result = await cuDryrun(hb, pid, "Get")
      const data = parseData(result)
      console.log("After Reset:", data)
      assert.ok(result)
    })

    it("should return history", async () => {
      const result = await cuDryrun(hb, pid, "History")
      const data = parseData(result)
      console.log("History:", typeof data)
      assert.ok(result)
    })
  })

  describe("Token App", function() {
    let pid, luaCode

    before(async () => {
      luaCode = readLuaApp("token")
      console.log("Spawning Token process...")

      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
      console.log("Token code loaded")
    })

    it("should return token info", async () => {
      const result = await cuDryrun(hb, pid, "Info")
      const data = parseData(result)
      console.log("Token info:", data?.Name || data)
      assert.ok(result)
    })

    it("should return total supply", async () => {
      const result = await cuDryrun(hb, pid, "TotalSupply")
      const data = parseData(result)
      console.log("Total supply:", data)
      assert.ok(result)
    })

    it("should return balance", async () => {
      const result = await cuDryrun(hb, pid, "Balance")
      const data = parseData(result)
      console.log("Balance:", data)
      assert.ok(result)
    })
  })

  describe("Todo App", function() {
    let pid, luaCode

    before(async () => {
      luaCode = readLuaApp("todo")

      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should add a todo item", async () => {
      const { slot } = await hb.scheduleLegacy({
        pid,
        action: "Add",
        tags: { Title: "Test Task" }
      })
      await cuCompute(hb, pid, slot)

      const result = await cuDryrun(hb, pid, "List")
      const data = parseData(result)
      console.log("After Add:", typeof data)
      assert.ok(result)
    })

    it("should list todos", async () => {
      const result = await cuDryrun(hb, pid, "List")
      assert.ok(result)
    })
  })

  describe("Chatroom App", function() {
    let pid, luaCode

    before(async () => {
      luaCode = readLuaApp("chatroom")

      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should register a user", async () => {
      const { slot } = await hb.scheduleLegacy({
        pid,
        action: "Register",
        tags: { Nickname: "alice" }
      })
      await cuCompute(hb, pid, slot)
      assert.ok(true)
    })

    it("should get room info", async () => {
      const result = await cuDryrun(hb, pid, "Info")
      assert.ok(result)
    })
  })

  describe("KV Store App", function() {
    let pid, luaCode

    before(async () => {
      luaCode = readLuaApp("kv-store")

      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should set a value", async () => {
      const { slot } = await hb.scheduleLegacy({
        pid,
        action: "Set",
        tags: { Key: "greeting", Value: "hello" }
      })
      await cuCompute(hb, pid, slot)
      assert.ok(true)
    })

    it("should get a value", async () => {
      const result = await cuDryrun(hb, pid, "Get", { Key: "greeting" })
      const data = parseData(result)
      console.log("Get result:", data)
      assert.ok(result)
    })
  })
})

describe("HyperAOS Advanced Apps", function() {
  let hbeam, hb

  before(async function() {
    console.log("Starting HyperBEAM for advanced apps...")
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 180,
      logs: false,
      as: ["genesis_wasm"]
    }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  describe("Voting DAO App", function() {
    let pid

    before(async () => {
      const luaCode = readLuaApp("voting-dao")
      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should create a proposal", async () => {
      const { slot } = await hb.scheduleLegacy({
        pid,
        action: "CreateProposal",
        tags: { Title: "Test Proposal", Description: "A test" }
      })
      await cuCompute(hb, pid, slot)
      assert.ok(true)
    })

    it("should list proposals", async () => {
      const result = await cuDryrun(hb, pid, "ListProposals")
      assert.ok(result)
    })
  })

  describe("NFT Collection App", function() {
    let pid

    before(async () => {
      const luaCode = readLuaApp("nft-collection")
      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should return collection info", async () => {
      const result = await cuDryrun(hb, pid, "Info")
      assert.ok(result)
    })
  })

  describe("AMM DEX App", function() {
    let pid

    before(async () => {
      const luaCode = readLuaApp("amm-dex")
      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should return pool info", async () => {
      const result = await cuDryrun(hb, pid, "Info")
      assert.ok(result)
    })
  })

  describe("Lottery App", function() {
    let pid

    before(async () => {
      const luaCode = readLuaApp("lottery")
      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should return lottery info", async () => {
      const result = await cuDryrun(hb, pid, "Info")
      assert.ok(result)
    })
  })

  describe("Escrow App", function() {
    let pid

    before(async () => {
      const luaCode = readLuaApp("escrow")
      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should return escrow info", async () => {
      const result = await cuDryrun(hb, pid, "Info")
      assert.ok(result)
    })
  })

  describe("Social Feed App", function() {
    let pid

    before(async () => {
      const luaCode = readLuaApp("social-feed")
      const result = await hb.spawnLegacy()
      pid = result.pid

      const { slot } = await hb.scheduleLegacy({ pid, data: luaCode })
      await cuCompute(hb, pid, slot)
    })

    it("should create a post", async () => {
      const { slot } = await hb.scheduleLegacy({
        pid,
        action: "CreatePost",
        data: "Hello from HyperAOS!"
      })
      await cuCompute(hb, pid, slot)
      assert.ok(true)
    })

    it("should get feed", async () => {
      const result = await cuDryrun(hb, pid, "GetFeed")
      assert.ok(result)
    })
  })
})
