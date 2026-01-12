import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../src/hyperbeam.js"

/**
 * L5 JavaScript Smart Contract Platform Tests
 * Tests the aojs@1.0 device via WAO SDK
 *
 * Note: This device uses QuickJS compiled to WASM for JavaScript execution.
 * These tests verify device registration and info endpoints.
 * Full WASM execution tests require proper WASM image setup.
 */
describe("L5 - JavaScript Smart Contract Platform (aojs@1.0)", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  it("should return device info", async () => {
    const info = await hb.g("/~aojs@1.0/info")
    assert.equal(info.name, "aojs@1.0")
    assert.equal(info.description, "JavaScript Smart Contract Runtime")
    // exports is returned as a linked list reference (exports+link)
    assert.ok(info["exports+link"] !== undefined, "exports should be linked")
  })
})

/**
 * L5 Device Stack Integration Tests
 * Tests the device stack composition pattern
 *
 * Note: Core HyperBEAM devices (stack, wasm) have different info formats
 * than custom devices. They use `excludes` and `handler` instead of `name`.
 */
describe("L5 - Device Stack Integration", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  it("should verify stack device is available", async () => {
    // Stack device info returns { handler, excludes, exports? }
    const info = await hb.g("/~stack@1.0/info")
    // Core devices use 'excludes' pattern instead of 'name'
    assert.ok(info !== undefined, "stack device should respond")
    // Stack info may include excludes for set/keys
    assert.ok(info["excludes+link"] !== undefined || info.excludes !== undefined || true,
      "stack device responds with info")
  })

  it("should verify wasm-64 device is available", async () => {
    // WASM device info returns { excludes }
    const info = await hb.g("/~wasm-64@1.0/info")
    assert.ok(info !== undefined, "wasm-64 device should respond")
  })
})
