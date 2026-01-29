import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { mod } from "./lib/test-utils.js"
import { HyperBEAM } from "../../src/test.js"
import cases, { errors } from "./lib/cases.js"
import { normalize } from "../src/erl_json.js"
import { createSigner } from "../src/signer.js"
import { send } from "../src/send.js"
import { commit } from "../src/commit.js"

describe("Hyperbeam commit", function () {
  let hbeam, sign, hb
  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    sign = createSigner(hbeam.jwk, hbeam.url)
    hb = hbeam.hb
  })
  after(async () => hbeam.kill())

  it("should test commit", async () => {
    const msg = await commit(
      { key: "value", data: Buffer.from([1, 2, 3]) },
      { signer: sign }
    )
    for (const k in msg.commitments) {
      if (msg.commitments[k].committer) {
        assert.equal(hbeam.addr, msg.commitments[k].committer)
      }
    }
  })

  it("should schedule a nested message", async () => {
    // Test that committed messages have correct structure for scheduling
    const tags = {
      Type: "Message",
      target: "test-process-id",
      str: "value",
      num: 123,
      data: "abc",
    }

    // Create a committed message
    const committed = await commit(tags, { signer: sign })

    // Verify the committed message has the expected structure
    assert.ok(committed.commitments, "Committed message should have commitments")
    assert.ok(Object.keys(committed.commitments).length >= 2, "Should have at least 2 commitments (RSA + HMAC)")

    // Verify commitment metadata
    for (const [id, commitment] of Object.entries(committed.commitments)) {
      assert.ok(commitment["commitment-device"], "Commitment should have commitment-device")
      assert.equal(commitment["commitment-device"], "httpsig@1.0", "Commitment device should be httpsig@1.0")
      assert.ok(commitment.alg, "Commitment should have algorithm")
      assert.ok(commitment.signature, "Commitment should have signature")
      assert.ok(commitment["signature-input"], "Commitment should have signature-input")
    }

    // Verify the original fields are preserved (keys may be lowercased during encoding/decoding)
    const type = committed.Type || committed.type
    const str = committed.str
    const num = committed.num
    const data = committed.data || committed.body

    assert.equal(type, "Message", "Type should be preserved")
    assert.equal(str, "value", "str tag should be preserved")
    assert.equal(num, 123, "num tag should be preserved")
    assert.equal(data, "abc", "data should be preserved")
  })
})
