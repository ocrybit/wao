import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Server", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true }).ready()))
  beforeEach(async () => (hb = hbeam.hb))

  after(async () => hbeam.kill())

  // data is persistent at 10001
  it("should be persistent", async () => {
    const { pid } = await hb.spawn({})
    const { edges } = await hb.messages({ pid })
    assert.equal(edges.length, 1)
    hbeam.kill()
    hbeam = await new HyperBEAM({ reset: false }).ready()
    const { edges: edges2 } = await hbeam.hb.messages({ pid })
    assert.equal(edges2.length, 1)
  })
})
