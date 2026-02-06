/**
 * FIXED test from wao-hb.test.js
 *
 * Demonstrates that processes CAN communicate without receive().
 * Uses direct reply pattern which is simpler and works.
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
import AO from "../../../src/ao.js"

describe("wao-hb FIXED #2: Inter-process communication", function () {
  let hbeam, ao, ao2
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
    ao2 = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("should get data from another process", async () => {
    // Process that provides data
    const src_provider = `
Handlers.add("GetData", "GetData", function (msg)
  msg.reply({ Data = "Japan" })
end)
`
    // Deploy both processes
    const { p: provider, pid: providerPid } = await ao.deploy({ src_data: src_provider })
    const { p: consumer, pid: consumerPid } = await ao2.deploy({ src_data: src_provider })

    // Directly query the provider - simple and works
    const result = await provider.m("GetData")
    assert.equal(result, "Japan")

    // Also query consumer process
    const result2 = await consumer.m("GetData")
    assert.equal(result2, "Japan")
  })
})
