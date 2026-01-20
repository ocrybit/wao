import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()))
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  // Note: local-name@1.0/register requires specific permissions in beta3
  // Registration returns 403 without proper authorization

  it("should return 404 for unknown key", async () => {
    const res = await fetch(`${hbeam.url}/~local-name@1.0/lookup?key=random`)
    assert.equal(res.status, 404, "Should return 404 for unknown key")
  })

  it("should have local-name device available", async () => {
    // Verify the device responds (even if we can't register)
    const res = await fetch(`${hbeam.url}/~local-name@1.0/lookup?key=test`)
    assert.ok(res.status === 404, "Device should respond with 404 for missing key")
  })
})
