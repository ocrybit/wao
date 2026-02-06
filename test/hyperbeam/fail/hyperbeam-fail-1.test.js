/**
 * FIXED test from hyperbeam.test.js
 *
 * Demonstrates querying a counter process without receive().
 * Using the same pattern as the working wao-hb tests.
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
import AO from "../../../src/ao.js"

describe("hyperbeam FIXED #1: Query counter", function () {
  let hbeam, ao
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("should query counter value", async () => {
    const src_counter = `
local count = 0
Handlers.add("Add", "Add", function (msg)
  count = count + tonumber(msg.Plus)
end)

Handlers.add("Get", "Get", function (msg)
  msg.reply({ Data = tostring(count) })
end)
`
    const { pid, p } = await ao.deploy({ src_data: src_counter })

    // Add values using msg() which is more reliable
    await p.msg("Add", { Plus: "3" })
    await p.msg("Add", { Plus: "2" })

    // Query directly
    const { out } = await p.msg("Get")
    assert.equal(out, "5")
  })
})
