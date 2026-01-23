import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Patch", function () {
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

  // Note: Full patch@1.0 tests require:
  // - genesis_wasm: true
  // - device-stack arrays which have commitment issues in beta3
  // - AOS process spawning
  // These tests verify basic server functionality.

  it("should have server running", async () => {
    const info = await hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond")
    assert.equal(info.port, 10001, "Port should be 10001")
  })

  it("should have message device available", async () => {
    const res = await hb.g("/~message@1.0/set/test", { key: "value" })
    assert.ok(res, "Message device should respond")
  })
})
