import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { pick } from "ramda"
import HyperBEAM from "../../src/hyperbeam.js"

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true }).ready()))
  beforeEach(async () => (hb = hbeam.hb))
  after(async () => hbeam.kill())

  it("should test json@1.0", async () => {
    const obj = { key: 1, key2: "2", key3: [1, { a: [2, 3] }], key4: { a: 3 } }
    const res = await hb.p("/~json@1.0/serialize", { ...obj })
    // Note: HyperBEAM linkifies nested objects (arrays, objects) as key+link
    const parsed = JSON.parse(res.body)
    assert.equal(parsed.key, 1)
    assert.equal(parsed.key2, "2")
    // Nested objects are stored as links
    assert.ok(parsed["key3+link"], "key3 should be linkified")
    assert.ok(parsed["key4+link"], "key4 should be linkified")

    // Deserialize JSON body into HyperBEAM message format.
    // Primitive values become headers; complex values (arrays, objects) are linkified.
    const { headers: h } = await hb.post({
      path: "/~json@1.0/deserialize",
      "ao-body-key": "body",
      body: JSON.stringify({ a: 1, b: [1, 2], c: { d: 4 } }),
    })
    assert.equal(h.a, "1")
    assert.equal(h["ao-types"], 'a="integer"')
    // Complex values are linkified by HyperBEAM (stored as link references)
    assert.ok(h["b+link"], "b should be linkified")
    assert.ok(h["c+link"], "c should be linkified")

    const { headers: h2 } = await hb.post({
      path: "/~json@1.0/deserialize",
      target: "json",
      "ao-body-key": "json",
      json: JSON.stringify({ a: 1, b: [1, 2], c: { d: 4 } }),
    })

    assert.equal(h2.a, "1")
    // Complex values are linkified
    assert.ok(h2["b+link"], "b should be linkified")
    assert.ok(h2["c+link"], "c should be linkified")
  })
})
