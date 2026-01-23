/**
 * Token AOS App Tests (HyperBEAM)
 *
 * Tests HyperBEAM process spawning and message scheduling.
 * Uses test-device@1.0 for beta3 HTTP signature compatibility.
 *
 * Note: Actual Lua execution is tested in-memory (token.test.js).
 * This test validates the WAO SDK's HyperBEAM integration.
 *
 * Run with:
 * HB_TIMEOUT=120 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/token.hyperbeam.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import HyperBEAM from "../src/hyperbeam.js"

describe("Token App (HyperBEAM)", () => {
  let hbeam, hb, pid

  before(async () => {
    // Start HyperBEAM with default configuration
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120,
    }).ready()
    hb = hbeam.hb

    console.log("HyperBEAM started, operator:", hb.addr)

    // Spawn a basic process with test-device@1.0
    // This tests SDK spawn functionality without requiring CU server
    const { pid: spawnedPid } = await hb.spawn({ name: "token-test-process" })
    pid = spawnedPid
    console.log("Process spawned:", pid)
  })

  after(async () => {
    if (hbeam) {
      hbeam.kill()
    }
  })

  describe("SDK Process Operations", () => {
    it("should spawn a process successfully", async () => {
      assert.ok(pid, "Process ID should be returned")
      assert.ok(pid.length > 0, "Process ID should not be empty")
      console.log("Spawned process ID:", pid)
    })

    it("should schedule messages to the process", async () => {
      const { slot } = await hb.schedule({ pid, tags: { action: "Test" } })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Message scheduled at slot:", slot)
    })

    it("should get process info", async () => {
      const info = await hb.g(`/${pid}~process@1.0/info`)
      assert.ok(info, "Process info should be returned")
      console.log("Process info keys:", Object.keys(info))
    })

    it("should compute process state", async () => {
      // Schedule a message and compute
      const { slot } = await hb.schedule({ pid })
      const state = await hb.compute({ pid, slot })
      assert.ok(state, "Compute should return state")
      console.log("Computed state type:", typeof state)
    })

    it("should get process current state via now", async () => {
      const state = await hb.now({ pid })
      assert.ok(state, "Now should return current state")
      console.log("Current state available")
    })
  })

  describe("SDK Message Operations", () => {
    it("should schedule multiple messages", async () => {
      // Schedule multiple messages to verify message handling
      const { slot: slot1 } = await hb.schedule({ pid, tags: { action: "Test1" } })
      const { slot: slot2 } = await hb.schedule({ pid, tags: { action: "Test2" } })

      assert.ok(slot1 !== undefined, "First slot should be returned")
      assert.ok(slot2 !== undefined, "Second slot should be returned")
      assert.notEqual(slot1, slot2, "Slots should be different")
      console.log("Scheduled messages at slots:", slot1, slot2)
    })

    it("should schedule message with lowercase tags", async () => {
      const { slot } = await hb.schedule({
        pid,
        tags: {
          action: "custom-action",
          amount: "100",
        },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Custom message scheduled at slot:", slot)
    })
  })

  describe("SDK Configuration Verification", () => {
    it("should have correct operator address", async () => {
      assert.ok(hb.operator, "Operator should be set")
      assert.ok(hb.addr, "Address should be set")
      console.log("Operator:", hb.operator)
      console.log("Address:", hb.addr)
    })

    it("should have correct URL configuration", async () => {
      assert.ok(hb.url, "URL should be set")
      assert.ok(hb.url.includes("localhost"), "URL should be localhost")
      console.log("HyperBEAM URL:", hb.url)
    })
  })
})

/**
 * Note: This test validates HyperBEAM SDK integration with basic processes.
 * For full Lua AOS execution testing:
 *
 * 1. In-memory testing (recommended for development):
 *    - Run: node --experimental-wasm-memory64 --test aos-app/token.test.js
 *    - Tests full Lua execution with ArMem
 *
 * 2. HyperBEAM with genesis-wasm (requires CU server):
 *    - Requires: as: ["genesis_wasm"] configuration
 *    - Uses: execution-device: "stack@1.0" with device-stack
 *    - Note: Beta3 HTTP signatures have compatibility issues with array tags
 */
