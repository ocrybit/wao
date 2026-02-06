/**
 * FIXED test from hyperbeam.test.js
 *
 * Demonstrates using values in handler without receive().
 * Using the same pattern as the working wao-hb tests.
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
import AO from "../../../src/ao.js"

describe("hyperbeam FIXED #2: Counter with fixed value", function () {
  let hbeam, ao
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("should use fixed value in handler", async () => {
    // Counter with fixed oracle value
    const src_counter = `
local count = 0
local ORACLE_VALUE = 3

Handlers.add("Add", "Add", function (msg)
  count = count + ORACLE_VALUE
end)

Handlers.add("Get", "Get", function (msg)
  msg.reply({ Data = tostring(count) })
end)
`
    const { pid, p } = await ao.deploy({ src_data: src_counter })

    // Add using the fixed value
    await p.msg("Add")

    // Verify count
    const { out } = await p.msg("Get")
    assert.equal(out, "3")
  })
})
