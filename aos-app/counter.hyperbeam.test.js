/**
 * Counter AOS App Tests (HyperBEAM)
 *
 * Tests basic HyperBEAM process spawning and messaging.
 * Uses test-device for basic validation.
 *
 * Note: Full AOS Lua execution on HyperBEAM requires:
 * - genesis-wasm CU server (for genesis-wasm@1.0 execution device)
 * - Or stack@1.0 with wasm-64 (requires cached WASM image)
 *
 * For local Lua testing, use counter.test.js which runs in-memory.
 *
 * Run with:
 * HB_TIMEOUT=120 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/counter.hyperbeam.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import HyperBEAM from "../src/hyperbeam.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load the counter Lua script for reference
const counterScript = readFileSync(resolve(__dirname, "counter.lua"), "utf8")

/**
 * Helper to spawn a process using direct JSON POST
 * This is the beta3-compatible way to submit committed messages
 */
async function spawnProcess(hb, tags = {}) {
  const testTags = {
    type: "Process",
    device: "process@1.0",
    scheduler: hb.addr,
    "execution-device": "test-device@1.0",
    "random-seed": `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...tags,
  }

  const committed = await hb.commit(testTags, { path: false })

  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spawn failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    pid: response.headers.get("process"),
    slot: response.headers.get("slot"),
    status: response.status,
  }
}

/**
 * Helper to schedule a message to a process
 */
async function scheduleMessage(hb, pid, tags = {}) {
  const testTags = {
    type: "Message",
    target: pid,
    ...tags,
  }

  const committed = await hb.commit(testTags, { path: false })

  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Schedule failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    slot: response.headers.get("slot"),
    status: response.status,
  }
}

describe("Counter App (HyperBEAM - Process Tests)", function() {
  let hbeam, hb, pid

  before(async () => {
    // Start HyperBEAM
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120,
    }).ready()

    hb = hbeam.hb
    console.log("HyperBEAM ready at", hbeam.url)
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  it("should spawn a process", async () => {
    const result = await spawnProcess(hb, {
      name: "counter-test-process",
    })
    pid = result.pid

    assert.ok(pid, "Process ID should be returned")
    assert.equal(result.slot, "0", "First slot should be 0")
    console.log("Spawned process:", pid)
  })

  it("should schedule messages to the process", async () => {
    // Schedule a message with Action tag (simulating what counter app would receive)
    const result = await scheduleMessage(hb, pid, {
      action: "Get",
    })

    assert.ok(result.slot, "Slot should be returned")
    assert.equal(result.status, 200, "Status should be 200")
    console.log("Message scheduled at slot:", result.slot)
  })

  it("should schedule Inc action", async () => {
    const result = await scheduleMessage(hb, pid, {
      action: "Inc",
    })

    assert.ok(result.slot, "Slot should be returned")
    console.log("Inc message scheduled at slot:", result.slot)
  })

  it("should schedule Add action with Amount tag", async () => {
    const result = await scheduleMessage(hb, pid, {
      action: "Add",
      Amount: "5",
    })

    assert.ok(result.slot, "Slot should be returned")
    console.log("Add message scheduled at slot:", result.slot)
  })

  it("should compute process state", async () => {
    // Compute at the current slot
    const results = await hb.g(`/${pid}~process@1.0/compute`, { slot: 4 })

    assert.ok(results, "Results should be returned")
    console.log("Compute results at slot 4:", Object.keys(results || {}))
  })

  it("should get process slot info", async () => {
    const slotInfo = await hb.g(`/${pid}~process@1.0/slot`)

    assert.ok(slotInfo, "Slot info should be returned")
    console.log("Process slot info:", slotInfo)
  })

  it("should have counter script available for deployment", () => {
    // Verify the counter script is loaded
    assert.ok(counterScript, "Counter script should be loaded")
    assert.ok(counterScript.includes("Handlers.add"), "Script should contain Handlers.add")
    assert.ok(counterScript.includes("Get"), "Script should have Get handler")
    assert.ok(counterScript.includes("Inc"), "Script should have Inc handler")
    assert.ok(counterScript.includes("Dec"), "Script should have Dec handler")
    assert.ok(counterScript.includes("Add"), "Script should have Add handler")
    assert.ok(counterScript.includes("Reset"), "Script should have Reset handler")
    assert.ok(counterScript.includes("Info"), "Script should have Info handler")
    console.log("Counter script has all expected handlers")
  })
})

describe("Counter App Script Validation", function() {
  it("should have valid Lua syntax structure", () => {
    // Check basic structure
    assert.ok(counterScript.includes("local count = 0"), "Should initialize count to 0")
    assert.ok(counterScript.includes("msg.reply"), "Should use msg.reply for responses")
  })

  it("should handle all expected actions", () => {
    const expectedActions = ["Get", "Inc", "Dec", "Add", "Reset", "Info"]
    for (const action of expectedActions) {
      assert.ok(
        counterScript.includes(`Handlers.add("${action}"`),
        `Should have ${action} handler`
      )
    }
  })
})
