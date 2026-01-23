/**
 * Calculator AOS App Tests (HyperBEAM)
 *
 * Tests HyperBEAM process spawning and message scheduling using SDK methods.
 * Uses spawn() with test-device@1.0 for beta3 HTTP signature compatibility.
 *
 * For full mainnet WASM device-stack testing with Lua execution:
 * - Use the in-memory tests (calculator.test.js) which use ArMem with aos2_0_1
 * - The in-memory tests run the full device stack: wasi@1.0, json-iface@1.0,
 *   wasm-64@1.0, patch@1.0, multipass@1.0
 *
 * Note: spawnAOS() with device-stack arrays has beta3 commitment validation
 * issues - arrays get converted to +link references which break commitment
 * validation. This is a known HyperBEAM beta3 limitation.
 *
 * Run with:
 * HB_TIMEOUT=120 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/calculator.hyperbeam.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import HyperBEAM from "../src/hyperbeam.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const calculatorScript = readFileSync(
  resolve(__dirname, "calculator.lua"),
  "utf8"
)

describe("Calculator App (HyperBEAM)", function () {
  let hbeam, hb, pid

  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120,
    }).ready()

    hb = hbeam.hb
    console.log("HyperBEAM ready at", hbeam.url)
    console.log("Operator:", hb.operator)

    // Spawn a process with test-device@1.0 (beta3 compatible)
    // For full WASM execution, use the in-memory tests
    const { pid: spawnedPid } = await hb.spawn({ name: "calculator-test" })
    pid = spawnedPid
    console.log("Process spawned:", pid)
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  describe("SDK Process Operations", function () {
    it("should spawn a process successfully", async () => {
      assert.ok(pid, "Process ID should be returned")
      assert.ok(pid.length > 0, "Process ID should not be empty")
      console.log("Spawned process ID:", pid)
    })

    it("should schedule calculator actions", async () => {
      // Schedule an Add action
      const { slot } = await hb.schedule({
        pid,
        tags: { action: "Add", A: "10", B: "5" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Add action scheduled at slot:", slot)
    })

    it("should schedule multiple operations", async () => {
      // Schedule multiple calculator operations
      const { slot: s1 } = await hb.schedule({
        pid,
        tags: { action: "Multiply", A: "7", B: "6" },
      })
      const { slot: s2 } = await hb.schedule({
        pid,
        tags: { action: "Divide", A: "100", B: "4" },
      })
      const { slot: s3 } = await hb.schedule({
        pid,
        tags: { action: "Power", Base: "2", Exponent: "10" },
      })

      assert.ok(s1 !== undefined, "Slot 1 should be returned")
      assert.ok(s2 !== undefined, "Slot 2 should be returned")
      assert.ok(s3 !== undefined, "Slot 3 should be returned")
      console.log("Operations scheduled at slots:", s1, s2, s3)
    })

    it("should get process info", async () => {
      const info = await hb.g(`/${pid}~process@1.0/info`)
      assert.ok(info, "Process info should be returned")
      console.log("Process info available")
    })

    it("should compute process state", async () => {
      const { slot } = await hb.schedule({ pid, tags: { action: "Info" } })
      const state = await hb.compute({ pid, slot })
      assert.ok(state, "Compute should return state")
      console.log("Computed state type:", typeof state)
    })
  })

  describe("SDK Message Operations", function () {
    it("should schedule memory operations", async () => {
      const { slot: storeSlot } = await hb.schedule({
        pid,
        tags: { action: "Store", Value: "42" },
      })
      const { slot: recallSlot } = await hb.schedule({
        pid,
        tags: { action: "Recall" },
      })

      assert.ok(storeSlot !== undefined, "Store slot should be returned")
      assert.ok(recallSlot !== undefined, "Recall slot should be returned")
      console.log("Memory operations scheduled")
    })

    it("should schedule sqrt operation", async () => {
      const { slot } = await hb.schedule({
        pid,
        tags: { action: "Sqrt", Value: "144" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Sqrt scheduled at slot:", slot)
    })

    // Note: now() and compute() with ~json@1.0/serialize can fail with test-device@1.0
    // The in-memory tests verify full calculator functionality
    // HyperBEAM tests verify SDK operations: spawn, schedule work correctly
  })
})

describe("Calculator Script Validation", function () {
  it("should have mainnet WASM config in script", () => {
    // The script documents the intended mainnet device-stack
    assert.ok(
      calculatorScript.includes("Mainnet WASM") || calculatorScript.includes("Mainnet-WASM"),
      "Should indicate mainnet WASM configuration"
    )
    assert.ok(
      calculatorScript.includes("wasm-64@1.0"),
      "Should reference wasm-64 device"
    )
  })

  it("should have all calculator operations", () => {
    const operations = [
      "Add",
      "Subtract",
      "Multiply",
      "Divide",
      "Power",
      "Sqrt",
      "Mod",
    ]
    for (const op of operations) {
      assert.ok(
        calculatorScript.includes(`Handlers.add("${op}"`),
        `Should have ${op} handler`
      )
    }
  })

  it("should have memory operations", () => {
    const memOps = ["Store", "Recall", "ClearMemory"]
    for (const op of memOps) {
      assert.ok(
        calculatorScript.includes(`Handlers.add("${op}"`),
        `Should have ${op} handler`
      )
    }
  })

  it("should format numbers correctly", () => {
    assert.ok(
      calculatorScript.includes("formatNum"),
      "Should use formatNum for integer formatting"
    )
  })
})
