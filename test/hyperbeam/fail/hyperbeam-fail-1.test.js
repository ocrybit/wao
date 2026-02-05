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
import AOHB from "../../../src/ao.js"

const testJwk = acc[0].jwk

describe("hyperbeam FAIL #1: Send().receive() cross-process query", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => (hb = await new HB({ url: hbeam.url }).init(testJwk)))
  after(async () => hbeam.kill())

  it("FAIL: should receive msg from another process", async () => {
    const src_data = `
local count = 0
Handlers.add("Add", "Add", function (msg)
  count = count + tonumber(msg.Plus)
end)

Handlers.add("Get", "Get", function (msg)
  msg.reply({ Data = tostring(count) })
end)

Handlers.add("Query", "Query", function (msg)
  local data = Send({ Target = msg.To, Action = "Get" }).receive().Data
  msg.reply({ Data = tostring(data) })
end)
`
    const ao = await new AOHB({ module_type: "mainnet", hb: hbeam.url }).init(
      testJwk
    )
    const ao2 = await new AOHB({ module_type: "mainnet", hb: hbeam.url }).init(
      testJwk
    )
    const { pid, p } = await ao.deploy({ src_data })
    const { pid: pid2, p: p2 } = await ao2.deploy({ src_data })
    await p.m("Add", { Plus: "3" })
    assert.equal(await p2.m("Query", { To: pid }), "3")
  })
})
