import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../src/hyperbeam.js"

/**
 * L1 Key-Value Store Device Tests
 * Tests the kv@1.0 device via WAO SDK
 */
describe("L1 - Key-Value Store Device (kv@1.0)", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  it("should return device info", async () => {
    const info = await hb.g("/~kv@1.0/info")
    assert.equal(info.name, "kv")
    assert.equal(info.version, "1.0")
    assert.equal(info.description, "Personal Key-Value Store")
  })

  it("should store and retrieve values", async () => {
    // Store a value
    const setRes = await hb.p("/~kv@1.0/set", {
      key: "greeting",
      value: "Hello, HyperBEAM!"
    })
    assert.equal(setRes.status, "stored")
    assert.equal(setRes.key, "greeting")

    // Retrieve the value
    const getRes = await hb.g("/~kv@1.0/get?key=greeting")
    assert.equal(getRes.value, "Hello, HyperBEAM!")
    assert.equal(getRes.key, "greeting")
  })

  it("should list all keys", async () => {
    // Store multiple values
    await hb.p("/~kv@1.0/set", { key: "key1", value: "value1" })
    await hb.p("/~kv@1.0/set", { key: "key2", value: "value2" })

    // List keys
    const keysRes = await hb.g("/~kv@1.0/keys")
    assert.ok(keysRes.keys.includes("key1"))
    assert.ok(keysRes.keys.includes("key2"))
    assert.ok(keysRes.count >= 2)
  })

  it("should delete keys", async () => {
    // Store a value
    await hb.p("/~kv@1.0/set", { key: "temp", value: "temporary" })

    // Delete it
    const deleteRes = await hb.p("/~kv@1.0/delete", { key: "temp" })
    assert.equal(deleteRes.status, "deleted")

    // Verify it's gone
    try {
      await hb.g("/~kv@1.0/get?key=temp")
      assert.fail("Should have thrown")
    } catch (e) {
      assert.equal(e.status, 404)
    }
  })

  it("should return 400 for missing key parameter", async () => {
    try {
      await hb.g("/~kv@1.0/get")
      assert.fail("Should have thrown")
    } catch (e) {
      assert.equal(e.status, 400)
    }
  })

  it("should return 404 for nonexistent key", async () => {
    try {
      await hb.g("/~kv@1.0/get?key=nonexistent_key_12345")
      assert.fail("Should have thrown")
    } catch (e) {
      assert.equal(e.status, 404)
    }
  })
})
