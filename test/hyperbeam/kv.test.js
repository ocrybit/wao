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
  })

  it("should store and retrieve values", async () => {
    // Store a value
    const storeRes = await hb.p("/~kv@1.0/store", {
      k: "greeting",
      value: "Hello, HyperBEAM!"
    })
    assert.equal(storeRes.result, "stored")
    assert.equal(storeRes.k, "greeting")

    // Fetch the value - use params object, not query string
    const fetchRes = await hb.g("/~kv@1.0/fetch", { k: "greeting" })
    assert.equal(fetchRes.value, "Hello, HyperBEAM!")
    assert.equal(fetchRes.k, "greeting")
  })

  it("should list all keys", async () => {
    // Store multiple values
    await hb.p("/~kv@1.0/store", { k: "key1", value: "value1" })
    await hb.p("/~kv@1.0/store", { k: "key2", value: "value2" })

    // List keys - check count since keys are returned as a linked list
    const keysRes = await hb.g("/~kv@1.0/list_keys")
    // Keys are linked in HyperBEAM responses, so we check count
    assert.ok(keysRes.count >= 2, `Expected count >= 2, got ${keysRes.count}`)
  })

  it("should delete keys", async () => {
    // Store a value
    await hb.p("/~kv@1.0/store", { k: "temp", value: "temporary" })

    // Delete it
    const deleteRes = await hb.p("/~kv@1.0/remove_key", { k: "temp" })
    assert.equal(deleteRes.result, "deleted")

    // Verify it's gone - check for error response (error_code 404)
    const fetchRes = await hb.g("/~kv@1.0/fetch", { k: "temp" })
    // Device returns error_code (not status, to avoid HTTP status conflict)
    assert.ok(fetchRes.error_code === 404 || fetchRes.error,
      `Expected 404 error, got: ${JSON.stringify({error_code: fetchRes.error_code, error: fetchRes.error})}`)
  })

  it("should return 400 for missing key parameter", async () => {
    const res = await hb.g("/~kv@1.0/fetch")
    // Device returns error_code for client errors
    assert.equal(res.error_code, 400)
  })

  it("should return 404 for nonexistent key", async () => {
    const res = await hb.g("/~kv@1.0/fetch", { k: "nonexistent_key_xyz" })
    // Device returns error_code for not found
    assert.ok(res.error_code === 404 || res.error,
      `Expected 404 or error, got error_code: ${res.error_code}`)
  })
})
