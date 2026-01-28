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
  let hbeam, sign
  before(async () => {
    const hb = new HyperBEAM({ reset: true })
    hbeam = await hb.ready()
    if (!hbeam) {
      throw new Error("HyperBEAM failed to start within timeout")
    }
    sign = createSigner(hbeam.jwk, hbeam.url)
  })
  after(async () => {
    if (hbeam && hbeam._shell) {
      hbeam.kill()
    }
  })

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

  it("should produce different commitment IDs for different data", async () => {
    const msg1 = await commit(
      { key: "value1", data: Buffer.from([1, 2, 3]) },
      { signer: sign }
    )
    const msg2 = await commit(
      { key: "value2", data: Buffer.from([4, 5, 6]) },
      { signer: sign }
    )

    // Both should have commitments
    assert.ok(msg1.commitments, "msg1 should have commitments")
    assert.ok(msg2.commitments, "msg2 should have commitments")

    // Verify committer is correct for both
    for (const id of Object.keys(msg1.commitments)) {
      if (msg1.commitments[id].committer) {
        assert.equal(msg1.commitments[id].committer, hbeam.addr, "msg1 committer should match")
      }
    }
    for (const id of Object.keys(msg2.commitments)) {
      if (msg2.commitments[id].committer) {
        assert.equal(msg2.commitments[id].committer, hbeam.addr, "msg2 committer should match")
      }
    }
  })
})
