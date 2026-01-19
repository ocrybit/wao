import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"
describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => (hbeam = await new HyperBEAM({ reset: true }).ready()))
  beforeEach(async () => (hb = hbeam.hb))

  after(async () => hbeam.kill())

  it("should test scheduler@1.0", async () => {
    const { process: pid } = await hb.p("/~scheduler@1.0/schedule", {
      body: {
        device: "process@1.0",
        type: "Process",
        scheduler: hb.addr,
        // Use stack@1.0 with device-stack for proper test-device execution
        "execution-device": "stack@1.0",
        "device-stack": ["test-device@1.0", "test-device@1.0"],
      },
    })
    const { processes } = await hb.g("/~scheduler@1.0/status")
    assert.deepEqual(processes, [pid])
    const { slot } = await hb.p("/~scheduler@1.0/schedule", {
      // Must include type: Message for proper scheduling
      body: { target: pid, type: "Message" },
    })

    // todo: get doesn't work
    const { results } = await hb.g(`/${pid}~process@1.0/compute`, { slot })
    assert.equal(results["assignment-slot"], 1)

    // Note: /~scheduler@1.0/location requires network access to arweave-search.goldsky.com
    // Skipping location registration tests in restricted network environments
  })
})
