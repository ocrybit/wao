import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("HyperBEAM Simple Test", function () {
  let hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
  })

  after(async () => {
    hbeam.kill()
  })

  it("should start and respond to meta info request", async () => {
    const info = await hbeam.hb.g("/~meta@1.0/info")
    assert.equal(info.port, 10001)
    assert.equal(info.initialized, "true")
    assert.ok(info.address)
  })
})
