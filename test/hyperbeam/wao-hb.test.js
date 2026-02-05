import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../src/hyperbeam.js"
import AO from "../../src/ao.js"
import TAO from "../../src/tao.js"

const src_data = `
local count = 0
Handlers.add("Add", "Add", function (msg)
  count = count + tonumber(msg.Plus)
end)

Handlers.add("Get", "Get", function (msg)
  msg.reply({ Data = tostring(count) })
end)
`

describe("Hyperbeam Legacynet", function () {
  let hbeam, ao, ao2
  // genesis_wasm: true required - HyperBEAM delegates compute to external CU
  before(async () => (hbeam = await new HyperBEAM({ reset: true, genesis_wasm: true }).ready()))

  beforeEach(async () => {
    ao = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(hbeam.jwk)
    ao2 = await new AO({ module_type: "mainnet", hb: hbeam.url }).init(
      hbeam.jwk
    )
  })
  after(async () => {
    hbeam.kill()
  })

  it("should interact with hyperbeam using WAO SDK", async () => {
    const { pid, p } = await ao.deploy({ src_data })
    const { out } = await p.msg("Get")
    assert.equal(out, "0")
    await p.msg("Add", { Plus: "3" })
    const { out: out2 } = await p.msg("Get")
    assert.equal(out2, "3")
  })

  // MOVED TO fail/wao-hb-fail.test.js: "should spawn a message from a handler with receive"
  // REASON: Send().receive() pattern not supported by external CU

  it("should get with optional match", async () => {
    const src_data = `
local json = require("json")
Handlers.add("Hello", "Hello", function (msg)
  Send({Target = msg.To, Data = "Hello" })
  Send({Target = msg.From, Data = json.encode({ Hello = "World", Age = 5 })})
  Send({Target = msg.From, Tag = json.encode({ Hello = "AO" }), Data = json.encode({ Hello = "World!" })})
end)
`
    const { p, pid } = await ao.deploy({ src_data })
    assert.deepEqual(
      await p.d("Hello", {
        get: {
          json: true,
          data: true,
          match: (v, i, r) => v.Hello !== "World",
        },
      }),
      { Hello: "World!" }
    )
    assert.deepEqual(
      await p.d("Hello", {
        get: {
          name: "Tag",
          json: true,
          match: v => v.Hello === "AO",
        },
      }),
      { Hello: "AO" }
    )
    assert.deepEqual(
      await p.d("Hello", {
        get: {
          data: true,
          json: true,
          match: v => v.Age < 10,
        },
      }),
      { Hello: "World", Age: 5 }
    )
  })

  // MOVED TO fail/wao-hb-fail.test.js: "should handle replies between multiple processes"
  // REASON: Send().receive() pattern not supported by external CU
})
