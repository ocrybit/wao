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

const src_data = `
Handlers.add("Hello2", "Hello2", function (msg)
  local name = Send({ Target = ao.id, Action = "Reply" }).receive().Data
  msg.reply({ Hello = "Hello, " .. name .. "!" })
end)

Handlers.add("Reply", "Reply", function (msg)
  msg.reply({ Data = "Japan" })
end)
`

describe("wao-hb FAIL #1: Send().receive() self-message", function () {
  let hbeam, ao
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("FAIL: should spawn a message from a handler with receive", async () => {
    const { p, pid } = await ao.deploy({ boot: true, src_data })
    assert.equal(
      await p.m("Hello2", { get: "Hello", timeout: 3000 }),
      "Hello, Japan!"
    )
  })
})
