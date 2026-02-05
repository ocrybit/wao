/**
 * Failing test from p4.test.js
 *
 * MULTIPLE ISSUES:
 *
 * 1. ✅ FIXED: HTTPSig signature verification for JS nested commitments
 *    The signature_params_line() in dev_codec_httpsig.erl was rebuilding signature-input
 *    instead of using the stored one. This caused `path` to be transformed to `@path`
 *    during verification, breaking signatures. Fixed by using stored signature-input directly.
 *
 * 2. ⚠️ Cross-instance module access:
 *    Test caches Lua scripts on HyperBEAM #1, gets IDs, then starts HyperBEAM #2
 *    with those IDs in p4_lua config. HyperBEAM #2 can't access #1's cache, so
 *    dev_lua:load_modules() returns 404. Fix: Pass module content inline or
 *    configure routes to fetch from #1.
 *
 * 3. ⚠️ Type conversion before signature verification:
 *    HyperBEAM's JSON codec applies ao-types conversion BEFORE signature verification.
 *    This causes numeric values like quantity: "100" to be converted during parsing,
 *    invalidating the original signature.
 */
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { acc, toAddr } from "../../../src/test.js"
import HB from "../../../src/hb.js"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("p4 FAIL #1: Type conversion before signature verification", function () {
  let hb, hbeam
  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      operator: HyperBEAM.OPERATOR,
    }).ready()
  })
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  it("FAIL: should handle payment with lua (type conversion issue)", async () => {
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
      quantity: "100",
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
