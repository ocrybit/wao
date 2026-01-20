import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam WAO-HB", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => {
    hbeam.kill()
  })

  // Note: Full WAO-HB tests require:
  // - genesis_wasm: true for AO deployment
  // - AO SDK integration
  // - Lua handler execution
  // These tests verify basic server functionality.

  it("should have server running", async () => {
    const info = await hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond")
    assert.equal(info.port, 10001, "Port should be 10001")
  })

  it("should have scheduler available", async () => {
    const status = await hb.g("/~scheduler@1.0/status")
    assert.ok(status, "Scheduler status should be returned")
  })
})
