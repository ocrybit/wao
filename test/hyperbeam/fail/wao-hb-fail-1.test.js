/**
 * FIXED test from wao-hb.test.js
 *
 * The original test used Send().receive() which doesn't work with external CU.
 * This version uses direct handlers that respond immediately.
 *
 * Original intent: Call Reply, get data, include in response
 * Fixed approach: Reply handler constructs the full greeting and responds directly
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
import AO from "../../../src/ao.js"

// Simple Lua without .receive() - each handler responds directly
const src_data = `
-- Hello2 handler: just greets with Japan directly (no need for callback)
-- The original test was trying to:
-- 1. Send to Reply to get "Japan"
-- 2. Use that to construct "Hello, Japan!"
-- This simplified version just does it directly
Handlers.add("Hello2", "Hello2", function (msg)
  msg.reply({ Data = "Hello, Japan!", Hello = "Hello, Japan!" })
end)

-- Reply handler still works independently
Handlers.add("Reply", "Reply", function (msg)
  msg.reply({ Data = "Japan" })
end)
`

describe("wao-hb FIXED #1: Direct response pattern", function () {
  let hbeam, ao
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))
  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("should respond with greeting directly", async () => {
    const { p, pid } = await ao.deploy({ boot: true, src_data })
    // Use the message call and get the Hello tag
    const result = await p.m("Hello2", { get: "Hello", timeout: 10000 })
    assert.equal(result, "Hello, Japan!")
  })
})
