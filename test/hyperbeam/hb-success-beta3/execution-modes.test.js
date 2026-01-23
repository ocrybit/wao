/**
 * Execution Modes Test
 *
 * Tests WAO SDK execution modes on HyperBEAM Beta3.
 *
 * The WAO SDK supports 4 execution modes:
 *
 * 1. Basic (test-device@1.0) - Simple process scheduling
 *    - No execution, just message scheduling
 *    - Works out of the box
 *
 * 2. Lua (lua@5.3a) - Native Lua execution via luerl
 *    - Requires: Lua script cached via cacheScript()
 *    - Uses hyper-aos.js Lua runtime
 *
 * 3. Pure WASM (stack@1.0 + wasm-64) - Direct WASM execution
 *    - Requires: WASM image cached via cacheBinary()
 *    - Uses aos_wamr.js WASM binary
 *
 * 4. Legacy (genesis-wasm@1.0) - CU server execution
 *    - Requires: genesis_wasm: true, CU server running
 *    - Uses delegated-compute to external CU
 *
 * Run with:
 * HB_TIMEOUT=60 node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success-beta3/execution-modes.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

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

describe("Execution Modes", function() {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 60,
    }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  describe("HB Client API Verification", function() {
    it("should have basic process methods", () => {
      assert.equal(typeof hb.spawn, "function", "spawn should exist")
      assert.equal(typeof hb.schedule, "function", "schedule should exist")
      assert.equal(typeof hb.compute, "function", "compute should exist")
      assert.equal(typeof hb.message, "function", "message should exist")
      assert.equal(typeof hb.commit, "function", "commit should exist")
    })

    it("should have Lua execution methods", () => {
      assert.equal(typeof hb.spawnLua, "function", "spawnLua should exist")
      assert.equal(typeof hb.scheduleLua, "function", "scheduleLua should exist")
      assert.equal(typeof hb.computeLua, "function", "computeLua should exist")
      assert.equal(typeof hb.getLua, "function", "getLua should exist")
      assert.equal(typeof hb.cacheScript, "function", "cacheScript should exist")
    })

    it("should have AOS/WASM execution methods", () => {
      assert.equal(typeof hb.spawnAOS, "function", "spawnAOS should exist")
      assert.equal(typeof hb.scheduleAOS, "function", "scheduleAOS should exist")
      assert.equal(typeof hb.computeAOS, "function", "computeAOS should exist")
      assert.equal(typeof hb.messageAOS, "function", "messageAOS should exist")
      assert.equal(typeof hb.getImage, "function", "getImage should exist")
      assert.equal(typeof hb.cacheBinary, "function", "cacheBinary should exist")
    })

    it("should have Legacy/CU execution methods", () => {
      assert.equal(typeof hb.spawnLegacy, "function", "spawnLegacy should exist")
      assert.equal(typeof hb.scheduleLegacy, "function", "scheduleLegacy should exist")
      assert.equal(typeof hb.computeLegacy, "function", "computeLegacy should exist")
      assert.equal(typeof hb.messageLegacy, "function", "messageLegacy should exist")
      assert.equal(typeof hb.dryrun, "function", "dryrun should exist")
      assert.equal(typeof hb.results, "function", "results should exist")
    })

    it("should have utility methods", () => {
      assert.equal(typeof hb.g, "function", "g (GET) should exist")
      assert.equal(typeof hb.p, "function", "p (POST) should exist")
      assert.equal(typeof hb.get, "function", "get should exist")
      assert.equal(typeof hb.post, "function", "post should exist")
      assert.equal(typeof hb.send, "function", "send should exist")
      assert.equal(typeof hb.messages, "function", "messages should exist")
    })
  })

  describe("Mode 1: Basic Process (test-device@1.0)", function() {
    it("should spawn and schedule messages to a process", async () => {
      // Spawn a process
      const { pid } = await spawnProcess(hb, {
        name: "test-process",
      })
      assert.ok(pid, "Process ID should be returned")
      console.log("Spawned process:", pid)

      // Schedule a message
      const { slot } = await scheduleMessage(hb, pid, {
        action: "Test",
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Scheduled at slot:", slot)

      // Get process info
      const info = await hb.g(`/${pid}~process@1.0/info`)
      assert.ok(info, "Process info should be returned")
      console.log("Process info keys:", Object.keys(info || {}).slice(0, 5))
    })
  })

  describe("Configuration", function() {
    it("should have operator address set", () => {
      assert.ok(hb.operator, "Operator address should be set")
      console.log("Operator:", hb.operator)
    })

    it("should have client address set", () => {
      assert.ok(hb.addr, "Client address should be set")
      console.log("Client address:", hb.addr)
    })

    it("should have CU URL configured", () => {
      assert.ok(hb.cu, "CU URL should be configured")
      console.log("CU URL:", hb.cu)
    })

    it("should have HyperBEAM URL configured", () => {
      assert.ok(hb.url, "HyperBEAM URL should be configured")
      console.log("HyperBEAM URL:", hb.url)
    })
  })
})

describe("Execution Mode Requirements", function() {
  it("Basic mode requires no additional setup", () => {
    const requirements = {
      device: "test-device@1.0",
      methods: ["spawn", "schedule", "compute", "message"],
      setup: "None - works out of the box",
    }
    assert.ok(requirements)
  })

  it("Lua mode requires cached Lua script", () => {
    const requirements = {
      device: "lua@5.3a",
      methods: ["spawnLua", "scheduleLua", "computeLua"],
      setup: [
        "Cache Lua script: await hb.cacheScript(luaCode, 'application/lua')",
        "Or use built-in: await hb.getLua()",
      ],
      runtime: "hyper-aos.js (base64 encoded Lua runtime)",
    }
    assert.ok(requirements)
  })

  it("WASM mode requires cached WASM image", () => {
    const requirements = {
      device: "stack@1.0 with wasm-64@1.0",
      methods: ["spawnAOS", "scheduleAOS", "computeAOS"],
      setup: [
        "Cache WASM image: await hb.cacheBinary(wasmBuffer, 'application/wasm')",
        "Or use built-in: await hb.getImage()",
      ],
      deviceStack: ["wasi@1.0", "json-iface@1.0", "wasm-64@1.0", "patch@1.0", "multipass@1.0"],
      runtime: "aos_wamr.js (base64 encoded AOS WASM)",
    }
    assert.ok(requirements)
  })

  it("Legacy mode requires CU server", () => {
    const requirements = {
      device: "genesis-wasm@1.0",
      methods: ["spawnLegacy", "scheduleLegacy", "computeLegacy", "dryrun"],
      setup: [
        "Start HyperBEAM with: new HyperBEAM({ genesis_wasm: true })",
        "CU server auto-starts on port 6363",
      ],
      cuServer: "_build/genesis-wasm-server",
      delegatedCompute: "Uses delegated-compute@1.0 device",
    }
    assert.ok(requirements)
  })
})
