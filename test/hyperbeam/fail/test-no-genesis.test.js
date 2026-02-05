/**
 * Test Send().receive() pattern WITHOUT genesis_wasm flag
 *
 * KNOWN ISSUE: Send().receive() Pattern
 * This test explores whether HyperBEAM's execution WITHOUT the external CU
 * can support synchronous receive. Result: NO - even without genesis_wasm flag,
 * processes still use genesis-wasm@1.0 execution device by default.
 *
 * The hyper-aos.lua file explicitly has `handlers.receive()` returning 'not implemented'.
 * See CLAUDE.md section "FUNDAMENTAL LIMITATION: Send().receive() Pattern" for details.
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

describe("Test Send().receive() WITHOUT genesis_wasm", function () {
  let hbeam, ao
  // Note: NOT using genesis_wasm: true
  before(async () => (hbeam = await new HyperBEAM({ reset: true }).ready()))
  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("should spawn a message from a handler with receive", async () => {
    const { p, pid } = await ao.deploy({ boot: true, src_data })
    console.log("Process deployed:", pid)
    const result = await p.m("Hello2", { get: "Hello", timeout: 5000 })
    console.log("Result:", result)
    assert.equal(result, "Hello, Japan!")
  })
})
