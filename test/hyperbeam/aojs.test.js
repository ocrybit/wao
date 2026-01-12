import assert from "assert"
import { after, describe, it, before } from "node:test"
import { readFileSync } from "fs"
import { resolve } from "path"
import HyperBEAM from "../../src/hyperbeam.js"

/**
 * L5 JavaScript Smart Contract Platform Tests
 * Tests the aojs@1.0 device and related WASM infrastructure via WAO SDK
 *
 * This device uses QuickJS compiled to WASM for JavaScript execution.
 * Tests verify:
 *   - Device registration and info endpoints
 *   - WASM module caching via wao@1.0 device
 *   - Device stack availability (stack@1.0, wasm-64@1.0)
 *
 * Note: Full WASM execution tests require process-based testing as HTTP
 * requests are stateless and WASM instances don't persist between requests.
 * See dev_aojs.erl for Erlang-level WASM execution tests.
 */

let hb, hbeam

describe("L5 - JavaScript Smart Contract Platform", function () {
  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam && hbeam.kill) {
      hbeam.kill()
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })

  describe("Device Registration (aojs@1.0)", function () {
    it("should return device info for aojs@1.0", async () => {
      const info = await hb.g("/~aojs@1.0/info")
      assert.equal(info.name, "aojs@1.0")
      assert.equal(info.description, "JavaScript Smart Contract Runtime")
      // exports is returned as a linked list reference (exports+link)
      assert.ok(info["exports+link"] !== undefined, "exports should be linked")
    })
  })

  describe("Device Stack Infrastructure", function () {
    it("should verify wao@1.0 utility device is available", async () => {
      const info = await hb.g("/~wao@1.0/info")
      assert.equal(info.name, "wao@1.0")
      assert.equal(info.description, "WAO SDK Utility Device")
    })

    // Note: stack@1.0 and wasm-64@1.0 use info/2 (not info/3) so they
    // are not directly accessible via HTTP. They are used internally
    // as part of device stacks for WASM execution.
  })

  describe("WASM Module Caching (wao@1.0)", function () {
    it("should cache a WASM module and return an ID", async () => {
      // Read the aojs.wasm file (QuickJS compiled to WASM)
      const wasmPath = resolve(hbeam.dirname, "aojs/aojs.wasm")
      const wasmBinary = readFileSync(wasmPath)

      // Verify WASM file exists and has content
      assert.ok(wasmBinary.length > 0, "WASM file should have content")
      assert.ok(wasmBinary.length > 100000, "aojs.wasm should be > 100KB")

      // Cache the WASM module using wao@1.0 device
      const result = await hb.p("/~wao@1.0/cache_module", {
        data: wasmBinary,
        "Content-Type": "application/wasm"
      })

      // Verify caching succeeded
      assert.equal(String(result.ok), "true", `Expected ok=true, got: ${result.ok}`)
      assert.ok(result.id, "Should return an ID")
      assert.ok(typeof result.id === "string", "ID should be a string")
      assert.ok(result.id.length > 10, "ID should be a valid hash")
    })

    it("should cache smaller test WASM module", async () => {
      // Read the test.wasm file (simpler factorial function)
      const wasmPath = resolve(hbeam.dirname, "test/test.wasm")
      const wasmBinary = readFileSync(wasmPath)

      // Cache the test WASM
      const result = await hb.p("/~wao@1.0/cache_module", {
        data: wasmBinary,
        "Content-Type": "application/wasm"
      })

      assert.equal(String(result.ok), "true", "Test WASM should cache successfully")
      assert.ok(result.id, "Should return an ID for test WASM")
    })
  })
})
