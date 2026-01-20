import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam ANS-104", function () {
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

  // Note: Full ANS-104 deployment tests require genesis_wasm: true
  // and the full AO deployment flow which has additional dependencies.
  // These tests verify basic server availability.

  it("should have server running", async () => {
    const info = await hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond")
    assert.equal(info.port, 10001, "Port should be 10001")
  })

  it("should have json device for message encoding", async () => {
    // JSON device is used for ANS-104 message encoding
    const obj = { key: "value" }
    const res = await hb.p("/~json@1.0/serialize", { ...obj })
    assert.ok(res.body, "JSON serialize should return body")
  })
})
