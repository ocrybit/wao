import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
const URL = "http://localhost:10001"

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
  })
  beforeEach(async () => (hb = hbeam.hb))

  after(async () => {
    hbeam.kill()
  })

  it("should test relay@1.0 cast", async () => {
    // Test relay cast - should return immediately with "OK"
    // Cast is async so it doesn't wait for the relay to complete
    const res = await hb.post({
      path: "/~relay@1.0/cast",
      "relay-path": `${URL}/~meta@1.0/info`,
      "relay-method": "GET",
    })
    assert.equal(res.body, "OK", "Cast should return OK immediately")
  })

  it("should test relay@1.0 cast with local URL", async () => {
    // Test relay cast to local HyperBEAM endpoint
    const res = await hb.post({
      path: "/~relay@1.0/cast",
      "relay-path": `${URL}/~json@1.0/serialize`,
      "relay-method": "POST",
      "relay-body": JSON.stringify({ test: "value" }),
    })
    assert.equal(res.body, "OK", "Cast should return OK immediately")
  })
})
