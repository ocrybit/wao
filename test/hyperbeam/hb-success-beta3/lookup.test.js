import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Lookup", function () {
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

  // Note: lookup@1.0/read requires cache@1.0/write which needs cache_writers permission
  // Without explicit permission configuration, we test basic device availability

  it("should return 404 for missing target", async () => {
    const res = await fetch(`${hbeam.url}/~lookup@1.0/read?target=nonexistent`)
    assert.equal(res.status, 404, "Should return 404 for missing target")
  })
})
