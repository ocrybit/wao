import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

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
    // Note: Erlang atoms are serialized as strings in HyperBEAM HTTP responses
    assert.equal(String(deleteRes.ok), "true")

    // Verify it's gone - device returns {ok: "false", error: "..."}
    const fetchRes = await hb.g("/~kv@1.0/fetch", { k: "temp" })
    assert.equal(String(fetchRes.ok), "false", `Expected ok="false", got: ${fetchRes.ok}`)
    assert.ok(fetchRes.error, "Expected error message")
  })

  it("should return ok=false for missing key parameter", async () => {
    const res = await hb.g("/~kv@1.0/fetch")
    // Device returns {ok: "false", error: "Missing..."} for missing parameter
    // Erlang atoms are serialized as strings
    assert.equal(String(res.ok), "false")
    assert.ok(res.error.includes("Missing"), `Expected 'Missing' in error: ${res.error}`)
  })

  it("should return ok=false for nonexistent key", async () => {
    const res = await hb.g("/~kv@1.0/fetch", { k: "nonexistent_key_xyz" })
    // Device returns {ok: "false", error: "Key not found"} for not found
    // Erlang atoms are serialized as strings
    assert.equal(String(res.ok), "false", `Expected ok="false", got: ${res.ok}`)
    assert.ok(res.error.includes("not found"), `Expected 'not found' in error: ${res.error}`)
  })
})
