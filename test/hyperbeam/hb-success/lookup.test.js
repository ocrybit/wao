import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true }).ready()))
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  it("should test lookup@1.0", async () => {
    // Set cache_writers to allow the current address to write to cache
    await hb.p("/~meta@1.0/info", { cache_writers: [hb.addr] })
    // Note: cache_writers may not be returned in GET response, but should still be set
    const { path } = await hb.p("/~cache@1.0/write", { body: "abc" })
    const val = await hb.g("/~lookup@1.0/read", { target: path })
    assert.equal(val, "abc")
  })
})
