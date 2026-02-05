/**
 * Test Send().receive() pattern using wasm-64@1.0 device
 *
 * KNOWN ISSUE: Send().receive() Pattern
 * This test explores whether HyperBEAM's wasm-64@1.0 device can support
 * synchronous receive. Result: Spawn fails with "Cannot create nested path"
 * error due to incompatible spawn parameters.
 *
 * The wasm-64@1.0 device uses different execution model than genesis-wasm@1.0.
 * Even if spawn worked, hyper-aos.lua has `handlers.receive()` returning 'not implemented'.
 * See CLAUDE.md section "FUNDAMENTAL LIMITATION: Send().receive() Pattern" for details.
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
import HB from "../../../src/hb.js"

const src_data = `
Handlers.add("Hello2", "Hello2", function (msg)
  local name = Send({ Target = ao.id, Action = "Reply" }).receive().Data
  msg.reply({ Hello = "Hello, " .. name .. "!" })
end)

Handlers.add("Reply", "Reply", function (msg)
  msg.reply({ Data = "Japan" })
end)
`

describe("Test Send().receive() with wasm-64@1.0", function () {
  let hbeam, hb
  before(async () => (hbeam = await new HyperBEAM({ reset: true }).ready()))
  beforeEach(async () => {
    hb = await new HB({ url: hbeam.url }).init(hbeam.jwk)
  })
  after(async () => hbeam.kill())

  it("should spawn a process using wasm-64@1.0", async () => {
    // Try spawning with wasm-64@1.0 instead of genesis-wasm@1.0
    const { pid, slot } = await hb.spawn({
      module: "ISShJH1ij-hPPt9St5UFFr_8Ys3Kj5cyg7zrMGt7H9s",
      tags: {
        "execution-device": "wasm-64@1.0",
        "On-Boot": "Data",
      },
      data: src_data,
    })
    console.log("Process spawned:", pid, "slot:", slot)

    if (!pid) {
      console.log("Spawn failed - checking if wasm-64@1.0 works differently")
      return
    }

    // Schedule a message
    const schedRes = await hb.schedule({
      pid,
      tags: { Action: "Hello2" },
    })
    console.log("Schedule result:", schedRes)

    // Compute the result
    const result = await hb.compute({ pid, slot: schedRes.slot })
    console.log("Compute result:", result)
  })
})
