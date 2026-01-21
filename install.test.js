/**
 * Installation verification test
 *
 * Quick sanity check that WAO SDK is properly installed.
 * Spawns one Lua process and sends one message.
 *
 * Run with:
 * . ~/.asdf/asdf.sh && HB_TIMEOUT=30 node --test install.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import HyperBEAM from "./src/hyperbeam.js"

describe("Installation Check", () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 30 }).ready()
    hb = hbeam.hb
    console.log("HyperBEAM ready:", hb.url)
  })

  after(() => {
    hbeam?.kill()
  })

  it("should spawn Lua process and execute message", async () => {
    const moduleId = await hb.getLua()
    assert.ok(moduleId, "Lua module should be cached")

    // Spawn simple counter process
    const luaCode = `
Count = 0
Handlers.add("Inc", "Inc", function(msg)
  Count = Count + 1
  msg.reply({ Data = tostring(Count) })
end)
`
    const tags = {
      "data-protocol": "ao",
      variant: "ao.N.1",
      authority: hb.operator,
      module: moduleId,
      "execution-device": "lua@5.3a",
      type: "Process",
      device: "process@1.0",
      scheduler: hb.addr,
      data: luaCode,
    }

    const spawnRes = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await hb.commit(tags, { path: false })),
    })
    const pid = spawnRes.headers.get("process")
    assert.ok(pid, "Process should be spawned")

    // Send Inc message
    const msgTags = { type: "Message", target: pid, Action: "Inc" }
    const msgRes = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await hb.commit(msgTags, { path: false })),
    })
    const slot = msgRes.headers.get("slot")
    assert.ok(slot, "Message should be scheduled")

    // Compute
    const result = await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })
    assert.ok(result, "Compute should return result")

    console.log("Installation verified: Lua process spawned and executed")
  })
})
