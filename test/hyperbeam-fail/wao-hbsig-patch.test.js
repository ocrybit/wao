import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HB from "../../src/hb.js"
import HyperBEAM from "../../src/hyperbeam.js"

describe("WAO Patch Device Tests", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  it("should test patch@1.0", async () => {
    const { pid } = await hb.spawn({
      "execution-device": "stack@1.0",
      "device-stack": ["wao@1.0", "patch@1.0"],
      "patch-from": "/results",
      "patch-to": "/cache",
    })
    await hb.schedule({ pid })
    await hb.schedule({ pid })
    // now() returns the value directly for scalar paths (not wrapped in {body:...})
    const square = await hb.now({ pid, path: "/cache/square" })
    const double = await hb.now({ pid, path: "/cache/double" })
    assert.equal(square, 9)
    assert.equal(double, 6)
  })

  it("should test patch@1.0 again", async () => {
    const { pid } = await hb.spawn({
      "execution-device": "stack@1.0",
      "device-stack": ["wao@1.0", "patch@1.0"],
      "patch-from": "/results",
      "patch-to": "/cache",
    })
    await hb.schedule({ pid })
    await hb.schedule({ pid })
    const square = await hb.now({ pid, path: "/cache/square" })
    const double = await hb.now({ pid, path: "/cache/double" })
    assert.equal(square, 9)
    assert.equal(double, 6)
  })
})
