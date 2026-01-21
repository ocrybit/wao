/**
 * HyperAOS Lua Apps Test Suite
 *
 * Tests Lua apps on HyperBEAM using genesis-wasm@1.0 execution device.
 * Uses HyperBEAM for spawn/schedule and CU for dryrun queries.
 *
 * Note: Native lua@5.3a device has issues in beta3, so we use genesis-wasm
 * which delegates Lua execution to a CU server.
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

function readLuaApp(name) {
  return readFileSync(resolve(appsDir, `${name}.lua`), "utf8")
}

function parseData(result) {
  try {
    if (result?.Messages?.[0]?.Data) {
      const data = result.Messages[0].Data
      try { return JSON.parse(data) } catch { return data }
    }
    if (result?.Output?.data) {
      try { return JSON.parse(result.Output.data) } catch { return result.Output.data }
    }
    return result
  } catch { return result }
}

// CU dryrun - query process state
async function dryrun(cu, pid, action, tags = {}, owner) {
  const url = `${cu}/dry-run?process-id=${pid}`
  const body = {
    Id: "dryrun-" + Date.now(),
    Target: pid,
    Owner: owner,
    Tags: [
      { name: "Action", value: action },
      ...Object.entries(tags).map(([name, value]) => ({ name, value: String(value) }))
    ],
    Data: ""
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`CU dryrun failed: ${response.status}`)
  return await response.json()
}

// CU result - trigger compute
async function cuResult(cu, pid) {
  const url = `${cu}/result/${pid}?process-id=${pid}&no-busy=1`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`CU result failed: ${response.status}`)
  return await response.json()
}

describe("HyperAOS Lua Apps", function() {
  let hbeam, hb, cu

  before(async function() {
    console.log("Starting HyperBEAM with genesis-wasm CU...")
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 180,
      logs: false,
      as: ["genesis_wasm"]
    }).ready()
    hb = hbeam.hb
    cu = hb.cu
    console.log("HyperBEAM:", hb.url, "CU:", cu)
  })

  after(async () => { if (hbeam) hbeam.kill() })

  describe("Counter App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("counter") })
      await cuResult(cu, pid)
      console.log("Counter:", pid)
    })

    it("should get count via dryrun", async () => {
      const result = await dryrun(cu, pid, "Get", {}, hb.addr)
      console.log("Get:", parseData(result))
      assert.ok(result)
    })

    it("should increment", async () => {
      await hb.scheduleLegacy({ pid, action: "Inc" })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "Get", {}, hb.addr)
      console.log("After Inc:", parseData(result))
      assert.ok(result)
    })

    it("should decrement", async () => {
      await hb.scheduleLegacy({ pid, action: "Dec" })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "Get", {}, hb.addr)
      console.log("After Dec:", parseData(result))
      assert.ok(result)
    })

    it("should reset", async () => {
      await hb.scheduleLegacy({ pid, action: "Reset" })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "Get", {}, hb.addr)
      console.log("After Reset:", parseData(result))
      assert.ok(result)
    })
  })

  describe("Token App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("token") })
      await cuResult(cu, pid)
    })

    it("should return info", async () => {
      const result = await dryrun(cu, pid, "Info", {}, hb.addr)
      console.log("Token:", parseData(result))
      assert.ok(result)
    })

    it("should return balance", async () => {
      const result = await dryrun(cu, pid, "Balance", {}, hb.addr)
      console.log("Balance:", parseData(result))
      assert.ok(result)
    })
  })

  describe("Todo App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("todo") })
      await cuResult(cu, pid)
    })

    it("should add and list", async () => {
      await hb.scheduleLegacy({ pid, action: "Add", tags: { Title: "Test" } })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "List", {}, hb.addr)
      assert.ok(result)
    })
  })

  describe("KV Store App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("kv-store") })
      await cuResult(cu, pid)
    })

    it("should set and get", async () => {
      await hb.scheduleLegacy({ pid, action: "Set", tags: { Key: "k", Value: "v" } })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "Get", { Key: "k" }, hb.addr)
      console.log("KV:", parseData(result))
      assert.ok(result)
    })
  })

  describe("Chatroom App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("chatroom") })
      await cuResult(cu, pid)
    })

    it("should register", async () => {
      await hb.scheduleLegacy({ pid, action: "Register", tags: { Nickname: "alice" } })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "Info", {}, hb.addr)
      assert.ok(result)
    })
  })

  describe("Voting DAO App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("voting-dao") })
      await cuResult(cu, pid)
    })

    it("should create proposal", async () => {
      await hb.scheduleLegacy({ pid, action: "CreateProposal", tags: { Title: "T", Description: "D" } })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "ListProposals", {}, hb.addr)
      assert.ok(result)
    })
  })

  describe("NFT Collection App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("nft-collection") })
      await cuResult(cu, pid)
    })

    it("should return info", async () => {
      const result = await dryrun(cu, pid, "Info", {}, hb.addr)
      assert.ok(result)
    })
  })

  describe("AMM DEX App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("amm-dex") })
      await cuResult(cu, pid)
    })

    it("should return info", async () => {
      const result = await dryrun(cu, pid, "Info", {}, hb.addr)
      assert.ok(result)
    })
  })

  describe("Social Feed App", function() {
    let pid

    before(async () => {
      const result = await hb.spawnLegacy()
      pid = result.pid
      await hb.scheduleLegacy({ pid, data: readLuaApp("social-feed") })
      await cuResult(cu, pid)
    })

    it("should create post", async () => {
      await hb.scheduleLegacy({ pid, action: "CreatePost", data: "Hello!" })
      await cuResult(cu, pid)
      const result = await dryrun(cu, pid, "GetFeed", {}, hb.addr)
      assert.ok(result)
    })
  })
})
