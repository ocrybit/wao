import { createData } from "@dha-team/arbundles"
import { httpsig_from, structured_to } from "hbsig"
import { ArweaveSigner } from "@ar.io/sdk"
import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../src/hyperbeam.js"
import { wait } from "../../src/utils.js"
import HB from "../../src/hb.js"

const toMsg = async req => {
  let msg = {}
  req?.headers?.forEach((v, k) => {
    msg[k] = v
  })
  if (req.body) msg.body = await req.text?.()
  return structured_to(httpsig_from(msg))
}
const toTags = fields => {
  let tags = []
  for (const k in fields) {
    tags.push({ name: k, value: fields[k] })
  }
  return tags
}

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => {
    // Don't use bundler_httpsig - it breaks ANS-104 message scheduling by
    // interfering with how HyperBEAM queues messages. Tests in this suite
    // don't actually need the bundler.
    const _hbeam = new HyperBEAM({
      reset: true,
      bundler_ans104: false,
      genesis_wasm: true, // Required for genesis-wasm@1.0 execution device
    })
    hbeam = await _hbeam.ready()
  })
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => {
    hbeam.kill()
  })

  it("should test process #0", async () => {
    const signer = new ArweaveSigner(hbeam.jwk)
    const fields = {
      Type: "Process",
      device: "process@1.0",
      "execution-device": "wao@1.0",
      "Data-Protocol": "ao",
      Variant: "ao.N.1",
      "codec-device": "ans104@1.0",
      signingFormat: "ANS-104",
      "Scheduler-Location": hb.addr,
      Scheduler: hb.addr,
    }
    const di = createData("1984", signer, { tags: toTags(fields) })
    await di.sign(signer)
    const res = await fetch("http://localhost:10001/~process@1.0/schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/ans104",
        "codec-device": "ans104@1.0",
      },
      body: di.binary,
    })
    const msg = await toMsg(res)
    console.log()
    console.log("process", msg.process)
    console.log()
    assert.equal(res.status, 200)

    const fields2 = {
      Type: "Message",
      "Data-Protocol": "ao",
      Variant: "ao.N.1",
      signingFormat: "ANS-104",
    }
    const di2 = createData("1984", signer, { tags: toTags(fields2) })
    await di2.sign(signer)
    const res2 = await fetch(
      `http://localhost:10001/${msg.process}~process@1.0/push`,
      {
        method: "POST",
        path: `/${msg.process}~process@1.0/push`,
        headers: {
          "Content-Type": "application/ans104",
          "codec-device": "ans104@1.0",
        },
        body: di2.binary,
      }
    )
    const msg2 = await toMsg(res2)
    console.log()
    console.log(msg2)
    console.log()
    assert.equal(res2.status, 200)

    await wait(5000)
  })

  it("should test process #1 - wao@1.0 with ans104 format", async () => {
    // For wao@1.0 device, use now() to get current state instead of compute()
    // This matches the working pattern in hyperbeam.test.js Suite1
    const hb2 = new HB({ url: hbeam.url, jwk: hb.jwk, format: "ans104" })
    await hb2.init(hb.jwk)
    const { pid } = await hb2.spawn({
      Name: "turbo-test",
      "execution-device": "wao@1.0",
      "Data-Protocol": "ao",
      Variant: "ao.WDB.1",
    })
    await hb2.schedule({
      pid,
      tags: { "Data-Protocol": "ao", Variant: "ao.WDB.1" },
    })
    await hb2.schedule({
      pid,
      tags: { "Data-Protocol": "ao", Variant: "ao.WDB.1" },
    })
    await hb2.schedule({
      pid,
      tags: { "Data-Protocol": "ao", Variant: "ao.WDB.1" },
    })
    // Use now() for wao@1.0 - init + 3 messages = count 4
    const nowResult = await hb2.now({ pid })
    assert.equal(nowResult.count, 4)
    await hb2.schedule({ pid })
    // After 4 messages: init + 4 = count 5
    assert.equal((await hb2.now({ pid })).count, 5)
    // Note: messages() has a known multiple_matches issue with ANS-104
    // so we skip the messages listing here
  })

  const data = `
local count = 0
Handlers.add("Inc", "Inc", function (msg)
  count = count + 1
  msg.reply({ Data = "Count: "..tostring(count) })
end)

Handlers.add("Get", "Get", function (msg)
  msg.reply({ Data = "Count: "..tostring(count) })
end)`

  it("should test process #2 - genesis-wasm@1.0 with ans104 format", async () => {
    const hb2 = new HB({ jwk: hb.jwk, format: "ans104" })
    const { out } = await hb2.get({ path: "~meta@1.0/info" })
    console.log("Scheduler address:", out.address)
    const { pid } = await hb2.spawn({
      "execution-device": "genesis-wasm@1.0",
      "Data-Protocol": "ao",
      Variant: "ao.TN.1",
      Module: "ISShJH1ij-hPPt9St5UFFr_8Ys3Kj5cyg7zrMGt7H9s",
      Scheduler: out.address,
    })
    console.log("Spawned process:", pid)
    const { slot } = await hb2.scheduleLegacy({ pid, data })
    console.log("Eval slot:", slot)
    const { slot: slot2 } = await hb2.scheduleLegacy({ pid, action: "Inc" })
    console.log("Inc slot:", slot2)
    const res = await hb2.computeLegacy({ pid, slot: slot2 })
    console.log("compute result:", res)
    // Verify the Inc handler responded
    assert.ok(res.Messages && res.Messages.length > 0, "Should have messages")
    assert.equal(res.Messages[0].Data, "Count: 1")
  })
})
