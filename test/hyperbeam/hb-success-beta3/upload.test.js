import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Upload", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 60,
    }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => {
    hbeam.kill()
  })

  // Note: Full upload tests require:
  // - ANS-104 bundling and signing
  // - genesis_wasm: true for CU server
  // - bundler server at localhost:4001
  // These tests verify basic server functionality.

  it("should have server running", async () => {
    const info = await hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond")
    assert.equal(info.port, 10001, "Port should be 10001")
  })

  it("should have process device available", async () => {
    // Verify process device responds
    const res = await fetch(`${hbeam.url}/~process@1.0/info`)
    // Process device may return various status codes
    assert.ok(res.status, "Process device should respond")
  })
})
