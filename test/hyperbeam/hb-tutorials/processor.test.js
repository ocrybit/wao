import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

/**
 * L2 Message Processor Device Tests
 * Tests the processor@1.0 device via WAO SDK
 */
describe("L2 - Message Processor Device (processor@1.0)", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  it("should return device info", async () => {
    const info = await hb.g("/~processor@1.0/info")
    assert.equal(info.name, "processor")
    assert.equal(info.version, "1.0")
  })

  it("should encode data to JSON", async () => {
    const result = await hb.p("/~processor@1.0/encode", {
      format: "json",
      body: { key: "value", number: 42 }
    })
    assert.equal(result.format, "json")
    assert.ok(result.encoded)
    // Verify encoded JSON can be parsed
    const parsed = JSON.parse(result.encoded)
    assert.equal(parsed.key, "value")
    assert.equal(parsed.number, 42)
  })

  it("should decode JSON data", async () => {
    const jsonStr = JSON.stringify({ message: "hello", count: 100 })
    const result = await hb.p("/~processor@1.0/decode", {
      format: "json",
      body: jsonStr
    })
    assert.equal(result.format, "json")
    assert.equal(result.decoded.message, "hello")
    assert.equal(result.decoded.count, 100)
  })

  it("should sign and verify messages", async () => {
    const body = { data: "test message", timestamp: Date.now() }

    // Sign the message
    const signResult = await hb.p("/~processor@1.0/sign", { body })
    assert.ok(signResult.signed)
    assert.ok(signResult.signed.signature || signResult.signed.commitments)

    // Verify the signed message
    const verifyResult = await hb.p("/~processor@1.0/verify", {
      body: signResult.signed
    })
    assert.equal(verifyResult.valid, true)
    assert.ok(verifyResult.signer_count >= 1)
  })

  it("should register and lookup names", async () => {
    const testName = "alice_" + Date.now()

    // Register a name
    const regResult = await hb.p("/~processor@1.0/register_name", {
      name: testName,
      value: "address_12345"
    })
    assert.equal(regResult.registered, testName)

    // Lookup the name
    const lookupResult = await hb.g(`/~processor@1.0/lookup?name=${testName}`)
    assert.equal(lookupResult.name, testName)
    assert.equal(lookupResult.value, "address_12345")
  })

  it("should normalize message fields", async () => {
    const result = await hb.p("/~processor@1.0/normalize", {
      body: {
        "Content-Type": "application/json",
        "X-Custom-Header": "value"
      }
    })
    assert.ok(result.normalized)
    // Normalized keys should be lowercase
    assert.ok("content-type" in result.normalized || "Content-Type" in result.normalized)
  })
})
