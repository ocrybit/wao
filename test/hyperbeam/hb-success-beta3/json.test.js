import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()))
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  it("should test json@1.0/serialize", async () => {
    const obj = { key: 1, key2: "2", key3: [1, { a: [2, 3] }], key4: { a: 3 } }
    const res = await hb.p("/~json@1.0/serialize", { ...obj })

    // Parse the body (may be Buffer or string)
    const parsed = typeof res.body === 'string'
      ? JSON.parse(res.body)
      : JSON.parse(Buffer.from(res.body).toString())

    // Beta3 serialize returns a TABM-encoded message with:
    // - Simple values in the main object
    // - Nested structures (arrays/objects) encoded in the body as multipart
    // - The body-keys header indicates which keys were moved to body
    assert.equal(parsed.key, 1, "key should be number 1")
    assert.equal(parsed.key2, "2", "key2 should be string '2'")
    // Nested structures are encoded in body, indicated by body-keys header
    assert.ok(parsed["body-keys"] || parsed.body, "nested structures should be in body or body-keys")

    // Verify content-type
    assert.equal(res["content-type"], "application/json")
  })

  it("should test json@1.0/deserialize with body", async () => {
    const { headers: h } = await hb.post({
      path: "/~json@1.0/deserialize",
      body: JSON.stringify({ a: 1, b: [1, 2], c: { d: 4 } }),
    })

    // Beta3 returns:
    // - Simple values as strings in headers: a = "1"
    // - Arrays/objects as +link references: b+link, c+link
    assert.equal(h.a, "1", "a should be string '1' in header")
    assert.ok(h["b+link"], "b should be stored as +link reference")
    assert.ok(h["c+link"], "c should be stored as +link reference")
  })

  it("should test json@1.0/deserialize with json target", async () => {
    const { headers: h2 } = await hb.post({
      path: "/~json@1.0/deserialize",
      target: "json",
      json: JSON.stringify({ a: 1, b: [1, 2], c: { d: 4 } }),
    })

    // Same behavior with json target
    assert.equal(h2.a, "1", "a should be string '1' in header")
    assert.ok(h2["b+link"], "b should be stored as +link reference")
    assert.ok(h2["c+link"], "c should be stored as +link reference")
  })
})
