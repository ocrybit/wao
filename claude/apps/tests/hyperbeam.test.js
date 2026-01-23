/**
 * HyperAOS Lua Apps Test Suite
 *
 * Tests Lua apps on HyperBEAM using native lua@5.3a execution device.
 * Uses luerl (Lua in Erlang) directly in HyperBEAM - NO CU required.
 *
 * lua@5.3a device:
 * - Runs Lua code via luerl (Lua implemented in Erlang)
 * - Executes entirely within HyperBEAM process
 * - No external compute unit needed
 *
 * Run with:
 * HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js
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

/**
 * Spawn a Lua process with embedded module code
 * Uses the beta3-compatible JSON POST pattern
 */
async function spawnLuaProcess(hb, luaCode) {
  await hb.setInfo()

  // Get cached Lua runtime module
  const moduleId = await hb.getLua()

  const tags = {
    "data-protocol": "ao",
    variant: "ao.N.1",
    authority: hb.operator,
    module: moduleId,
    "execution-device": "lua@5.3a",
    "push-device": "push@1.0",
    "patch-from": "/results/outbox",
    type: "Process",
    device: "process@1.0",
    scheduler: hb.addr,
    "random-seed": `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }

  // Include Lua code as data if provided
  if (luaCode) {
    tags.data = luaCode
  }

  const committed = await hb.commit(tags, { path: false })

  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spawn failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    pid: response.headers.get("process"),
    slot: response.headers.get("slot"),
  }
}

/**
 * Schedule a message to a Lua process
 */
async function scheduleLuaMessage(hb, pid, { action, data, tags = {} } = {}) {
  const msgTags = {
    type: "Message",
    target: pid,
    ...tags,
  }

  if (action) msgTags.Action = action
  if (data) msgTags.data = data

  const committed = await hb.commit(msgTags, { path: false })

  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Schedule failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    slot: response.headers.get("slot"),
  }
}

/**
 * Compute process state at a slot
 */
async function computeLua(hb, pid, slot) {
  return await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })
}

/**
 * Get current process state via now endpoint
 */
async function nowLua(hb, pid) {
  return await hb.now({ pid })
}

describe("HyperAOS Lua Apps (lua@5.3a)", function() {
  let hbeam, hb

  before(async function() {
    console.log("Starting HyperBEAM...")
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120,
      logs: false,
    }).ready()
    hb = hbeam.hb
    console.log("HyperBEAM ready:", hb.url)
  })

  after(async () => { if (hbeam) hbeam.kill() })

  describe("Server Status", function() {
    it("should have HyperBEAM running", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok(info, "Server should respond")
      assert.equal(info.port, 10001)
      console.log("Server address:", info.address)
    })

    it("should have lua@5.3a device available", async () => {
      const build = await hb.g("/~meta@1.0/build")
      assert.ok(build, "Build info should be returned")
      console.log("Build:", build.node, build.vsn)
    })

    it("should cache Lua runtime module", async () => {
      const moduleId = await hb.getLua()
      assert.ok(moduleId, "Lua module should be cached")
      console.log("Lua module ID:", moduleId.substring(0, 20) + "...")
    })
  })

  describe("Basic Lua Process", function() {
    it("should spawn a Lua process", async () => {
      const simpleLua = `
local count = 0

Handlers.add("Get", "Get", function (msg)
  msg.reply({ Data = tostring(count) })
end)

Handlers.add("Inc", "Inc", function (msg)
  count = count + 1
  msg.reply({ Data = tostring(count) })
end)
`
      const { pid } = await spawnLuaProcess(hb, simpleLua)
      assert.ok(pid, "Process ID should be returned")
      console.log("Spawned Lua process:", pid)
    })

    it("should spawn and schedule to Lua process", async () => {
      const { pid, slot: spawnSlot } = await spawnLuaProcess(hb)
      assert.ok(pid, "Process should be spawned")
      console.log("Spawned:", pid, "at slot:", spawnSlot)

      // Schedule Eval message with Lua code
      const evalLua = `return "Hello from Lua!"`
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Eval", data: evalLua })
      assert.ok(slot, "Message should be scheduled")
      console.log("Scheduled Eval at slot:", slot)

      // Compute results
      const result = await computeLua(hb, pid, slot)
      assert.ok(result, "Compute result should be returned")
      console.log("Compute result type:", result?.type)
    })

    it("should get process info", async () => {
      const { pid } = await spawnLuaProcess(hb)
      const info = await hb.g(`/${pid}~process@1.0/info`)
      assert.ok(info, "Process info should be returned")
      console.log("Process execution-device:", info["execution-device"])
    })

    it("should get slot assignments", async () => {
      const { pid } = await spawnLuaProcess(hb)
      await scheduleLuaMessage(hb, pid, { action: "Test1" })
      await scheduleLuaMessage(hb, pid, { action: "Test2" })

      const slotInfo = await hb.g(`/${pid}~process@1.0/slot`)
      assert.ok(slotInfo, "Slot info should be returned")
      console.log("Current slot:", slotInfo)
    })
  })

  describe("Counter App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("counter"))
      pid = result.pid
      console.log("Counter process:", pid)
    })

    it("should spawn counter process", () => {
      assert.ok(pid, "Counter process should exist")
    })

    it("should schedule Inc message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Inc" })
      assert.ok(slot, "Inc message should be scheduled")
      console.log("Inc scheduled at slot:", slot)
    })

    it("should schedule Get message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Get" })
      assert.ok(slot, "Get message should be scheduled")
      console.log("Get scheduled at slot:", slot)
    })

    it("should compute state", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Inc" })
      const result = await computeLua(hb, pid, slot)
      assert.ok(result, "Compute should return result")
      console.log("Compute result:", result?.type, "at-slot:", result?.["at-slot"])
    })
  })

  describe("Token App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("token"))
      pid = result.pid
      console.log("Token process:", pid)
    })

    it("should spawn token process", () => {
      assert.ok(pid, "Token process should exist")
    })

    it("should schedule Info message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Info" })
      assert.ok(slot, "Info message should be scheduled")
    })

    it("should schedule Balance message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Balance" })
      assert.ok(slot, "Balance message should be scheduled")
    })
  })

  describe("Todo App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("todo"))
      pid = result.pid
      console.log("Todo process:", pid)
    })

    it("should spawn todo process", () => {
      assert.ok(pid, "Todo process should exist")
    })

    it("should schedule Add message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Add",
        tags: { Title: "Test Task" }
      })
      assert.ok(slot, "Add message should be scheduled")
    })

    it("should schedule List message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "List" })
      assert.ok(slot, "List message should be scheduled")
    })
  })

  describe("KV Store App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("kv-store"))
      pid = result.pid
      console.log("KV Store process:", pid)
    })

    it("should spawn kv-store process", () => {
      assert.ok(pid, "KV Store process should exist")
    })

    it("should schedule Set message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Set",
        tags: { Key: "mykey", Value: "myvalue" }
      })
      assert.ok(slot, "Set message should be scheduled")
    })

    it("should schedule Get message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Get",
        tags: { Key: "mykey" }
      })
      assert.ok(slot, "Get message should be scheduled")
    })
  })

  describe("Chatroom App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("chatroom"))
      pid = result.pid
      console.log("Chatroom process:", pid)
    })

    it("should spawn chatroom process", () => {
      assert.ok(pid, "Chatroom process should exist")
    })

    it("should schedule Register message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Register",
        tags: { Nickname: "alice" }
      })
      assert.ok(slot, "Register message should be scheduled")
    })
  })

  describe("Voting DAO App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("voting-dao"))
      pid = result.pid
      console.log("Voting DAO process:", pid)
    })

    it("should spawn voting-dao process", () => {
      assert.ok(pid, "Voting DAO process should exist")
    })

    it("should schedule CreateProposal message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "CreateProposal",
        tags: { Title: "Test Proposal", Description: "A test" }
      })
      assert.ok(slot, "CreateProposal message should be scheduled")
    })
  })

  describe("NFT Collection App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("nft-collection"))
      pid = result.pid
      console.log("NFT Collection process:", pid)
    })

    it("should spawn nft-collection process", () => {
      assert.ok(pid, "NFT Collection process should exist")
    })

    it("should schedule Info message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Info" })
      assert.ok(slot, "Info message should be scheduled")
    })
  })

  describe("AMM DEX App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("amm-dex"))
      pid = result.pid
      console.log("AMM DEX process:", pid)
    })

    it("should spawn amm-dex process", () => {
      assert.ok(pid, "AMM DEX process should exist")
    })

    it("should schedule Info message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Info" })
      assert.ok(slot, "Info message should be scheduled")
    })
  })

  describe("Social Feed App", function() {
    let pid

    before(async () => {
      const result = await spawnLuaProcess(hb, readLuaApp("social-feed"))
      pid = result.pid
      console.log("Social Feed process:", pid)
    })

    it("should spawn social-feed process", () => {
      assert.ok(pid, "Social Feed process should exist")
    })

    it("should schedule CreatePost message", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "CreatePost",
        data: "Hello world!"
      })
      assert.ok(slot, "CreatePost message should be scheduled")
    })
  })
})
