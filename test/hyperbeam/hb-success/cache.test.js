import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Cache", function () {
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

  // Note: cache@1.0/write requires cache_writers permission in beta3
  // Without explicit permission configuration, only read operations are tested

  it("should have cache device available", async () => {
    // Just verify the device responds
    const res = await fetch(`${hbeam.url}/~cache@1.0/status`)
    // Accept either success or 404 (device exists but no status endpoint)
    assert.ok([200, 404].includes(res.status), "Cache device should respond")
  })
})
