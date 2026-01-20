import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { pick } from "ramda"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()))
  beforeEach(async () => (hb = hbeam.hb))

  after(async () => hbeam.kill())

  it("should get meta@1.0/info", async () => {
    const info = await hb.g("/~meta@1.0/info")

    // Check essential fields
    assert.equal(info.port, 10001, "port should be 10001")
    assert.equal(info.address, hb.addr, "address should match client address")
    assert.equal(info.initialized, "true", "initialized should be 'true'")
  })

  it("should get meta@1.0/build", async () => {
    const build = await hb.g("/~meta@1.0/build")

    assert.equal(build.node, "HyperBEAM", "node should be HyperBEAM")
  })

  it("should get meta@1.0/info/address", async () => {
    const address = await hb.g("/~meta@1.0/info/address")

    assert.equal(address, hb.addr, "address should match client address")
  })
})
