import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { acc, toAddr } from "../../src/test.js"
import HB from "../../src/hb.js"
import HyperBEAM from "../../src/hyperbeam.js"

describe("Hyperbeam (FAIL)", function () {
  let hb, hbeam
  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      operator: HyperBEAM.OPERATOR,
    }).ready()
  })
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  it("should handle payment with lua (type conversion issue)", async () => {
    const port = 10002
    const addr2 = toAddr(acc[0].jwk.n)
    const process = hbeam.file("scripts/hyper-token-p4.lua")
    const pid = await hb.cacheScript(process)
    const client = hbeam.file("scripts/hyper-token-p4-client.lua")
    const cid = await hb.cacheScript(client)

    const hbeam2 = await new HyperBEAM({
      port,
      operator: hb.addr,
      p4_lua: { processor: pid, client: cid },
    }).ready()

    const hb3 = await new HB({ url: `http://localhost:${port}` }).init(hb.jwk)
    const hb4 = await new HB({ url: `http://localhost:${port}` }).init(
      acc[0].jwk
    )
    const tags = {
      path: "credit-notice",
      quantity: 100,
      recipient: addr2,
    }
    const lua_msg = await hb3.commit(tags)
    await hb3.scheduleNP({ pid: "ledger", tags })

    //await hb3.p("/ledger~node-process@1.0/schedule", { body: lua_msg })
    const balance = await hb3.g(`/ledger~node-process@1.0/now/balance/${addr2}`)
    assert.equal(balance, "100")
    const now = await hb3.g(`/ledger~node-process@1.0/now/balance`)
    assert.deepEqual(now, { [addr2]: "100" })
    assert(await hb4.p("/~message@1.0/set/hello", { hello: "world" }))
    const balance2 = await hb3.g(
      `/ledger~node-process@1.0/now/balance/${addr2}`
    )
    assert.equal(balance2, "97")
    hbeam2.kill()
  })
})
