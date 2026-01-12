import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../src/hyperbeam.js"

/**
 * L1 Key-Value Store Device Tests
 * Tests the kv@1.0 device via WAO SDK
 *
 * Note: Function names are store/fetch/remove_key/list_keys instead of
 * set/get/delete/keys to avoid conflicts with hb_ao internal operations.
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
    assert.equal(info.description, "Personal Key-Value Store with Persistence")
  })

  it("should store and retrieve values", async () => {
    // Store a value
    const storeRes = await hb.p("/~kv@1.0/store", {
      k: "greeting",
      value: "Hello, HyperBEAM!"
    })
    assert.equal(storeRes.status, "stored")
    assert.equal(storeRes.k, "greeting")

    // Fetch the value
    const fetchRes = await hb.g("/~kv@1.0/fetch?k=greeting")
    assert.equal(fetchRes.value, "Hello, HyperBEAM!")
    assert.equal(fetchRes.k, "greeting")
  })

  it("should list all keys", async () => {
    // Store multiple values
    await hb.p("/~kv@1.0/store", { k: "key1", value: "value1" })
    await hb.p("/~kv@1.0/store", { k: "key2", value: "value2" })

    // List keys
    const keysRes = await hb.g("/~kv@1.0/list_keys")
    assert.ok(keysRes.keys.includes("key1"))
    assert.ok(keysRes.keys.includes("key2"))
    assert.ok(keysRes.count >= 2)
  })

  it("should delete keys", async () => {
    // Store a value
    await hb.p("/~kv@1.0/store", { k: "temp", value: "temporary" })

    // Delete it
    const deleteRes = await hb.p("/~kv@1.0/remove_key", { k: "temp" })
    assert.equal(deleteRes.status, "deleted")

    // Verify it's gone
    try {
      await hb.g("/~kv@1.0/fetch?k=temp")
      assert.fail("Should have thrown")
    } catch (e) {
      assert.equal(e.status, 404)
    }
  })

  it("should return 400 for missing key parameter", async () => {
    try {
      await hb.g("/~kv@1.0/fetch")
      assert.fail("Should have thrown")
    } catch (e) {
      assert.equal(e.status, 400)
    }
  })

  it("should return 404 for nonexistent key", async () => {
    try {
      await hb.g("/~kv@1.0/fetch?k=nonexistent_key_12345")
      assert.fail("Should have thrown")
    } catch (e) {
      assert.equal(e.status, 404)
    }
  })
})
