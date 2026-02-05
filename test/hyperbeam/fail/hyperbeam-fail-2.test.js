/**
 * Failing test from hyperbeam.test.js (Suite2)
 *
 * KNOWN ISSUE: Send().receive() Pattern
 * The external CU (genesis-wasm-server) does not support synchronous .receive()
 * This test requires CU-level changes to support synchronous message handling.
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { acc } from "../../../src/test.js"
import HB from "../../../src/hb.js"
import HyperBEAM from "../../../src/hyperbeam.js"
import AO2 from "../../../src/ao.js"

const testJwk = acc[0].jwk

describe("hyperbeam FAIL #2: Send().receive() oracle pattern", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => (hb = await new HB({ url: hbeam.url }).init(testJwk)))
  after(async () => hbeam.kill())

  it("FAIL: should test oracle", async () => {
    const ao = await new AO2({ module_type: "mainnet", hb: hbeam.url }).init(
      testJwk
    )
    const ao2 = await new AO2({ module_type: "mainnet", hb: hbeam.url }).init(
      testJwk
    )
    const src_data = `
local count = 0
Handlers.add("Add", "Add", function (msg)
  local data = Send({ Target = msg.To, Action = "Plus" }).receive().Data
  count = count + tonumber(data)
end)

Handlers.add("Get", "Get", function (msg)
  msg.reply({ Data = tostring(count) })
end)
`
    const src_data2 = `
Handlers.add("Plus", "Plus", function (msg)
  msg.reply({ Data = tostring(3) })
end)
`
    const { p, pid } = await ao.deploy({ src_data })
    const { p: p2, pid: pid2 } = await ao2.deploy({ src_data: src_data2 })
    await p.m("Add", { To: pid2 })
    console.log(await p.m("Get"))
  })
})
