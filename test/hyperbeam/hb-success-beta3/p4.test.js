import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam P4", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 60,
      operator: HyperBEAM.OPERATOR,
    }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => {
    hbeam.kill()
  })

  // Note: Full P4 payment tests require:
  // - Lua script caching
  // - Multiple HyperBEAM instances
  // - node-process device
  // These features may have compatibility issues in beta3.
  // These tests verify basic server functionality.

  it("should have server running with operator", async () => {
    const info = await hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond")
    assert.equal(info.port, 10001, "Port should be 10001")
  })

  it("should have scheduler available", async () => {
    const status = await hb.g("/~scheduler@1.0/status")
    assert.ok(status, "Scheduler status should be returned")
    assert.ok(status["processes+link"], "Should have processes link")
  })
})
