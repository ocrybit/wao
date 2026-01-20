import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
import { extractPubKey } from "hbsig"
import { toAddr } from "../../../src/test.js"

describe("Hyperbeam Device (Beta3)", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()))
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  it("should test message@1.0 basic operations", async () => {
    // Test query parameter style
    assert.equal(await hb.g(`/~message@1.0&hello=world/hello`), "world")

    // Test set with GET
    assert.equal(
      (await hb.g(`/~message@1.0/set`, { hello: "world" })).hello,
      "world"
    )

    // Test set with POST
    assert.equal(
      (await hb.p(`/~message@1.0/set`, { hello: "world" })).hello,
      "world"
    )

    // Test set with path
    assert.equal(
      await hb.p(`/~message@1.0/set/hello`, { hello: "world" }),
      "world"
    )
  })

  it("should test message@1.0/commit signature", async () => {
    const { headers, out } = await hb.get({
      path: `/~message@1.0/commit`,
      hello: "world",
    })

    // Verify signature headers exist
    assert.ok(headers.signature, "signature header should exist")
    assert.ok(headers["signature-input"], "signature-input header should exist")

    // Extract public key and verify it matches client address
    // Beta3 uses "publickey:<base64-key>" format in keyid
    const pubKey = extractPubKey(headers)
    assert.ok(pubKey, "public key should be extractable from signature-input")

    const signerAddr = toAddr(pubKey.toString("base64"))
    assert.equal(hb.addr, signerAddr, "signer address should match client address")
  })
})
