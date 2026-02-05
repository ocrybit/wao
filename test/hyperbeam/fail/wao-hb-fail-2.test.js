/**
 * Failing test from wao-hb.test.js
 *
 * KNOWN ISSUE: Send().receive() Pattern
 * The external CU (genesis-wasm-server) does not support synchronous .receive()
 * This test requires CU-level changes to support synchronous message handling.
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
import AO from "../../../src/ao.js"

describe("wao-hb FAIL #2: Send().receive() cross-process", function () {
  let hbeam, ao, ao2
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
    ao2 = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("FAIL: should handle replies between multiple processes", async () => {
    const src_data = `
Handlers.add("Hello", "Hello", function (msg)
  local name = Send({ Target = msg.To, To = ao.id, Action = "Reply" }).receive().Data
  msg.reply({ Hello = "Hello, " .. name .. "!" })
end)

Handlers.add("Reply", "Reply", function (msg)
  msg.reply({ Data = "Japan" })
end)
`
    const { p, pid } = await ao.deploy({ src_data })
    const { p: p2, pid: pid2 } = await ao2.deploy({ src_data })
    assert.equal(
      await p.m("Hello", { To: pid2 }, { get: "Hello" }),
      "Hello, Japan!"
    )
  })
})
