import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Router Device", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => {
    hbeam.kill()
  })

  // Note: Full router tests require:
  // - Setting route_owners via meta@1.0/info (returns 400 in beta3)
  // - Authorization for route management
  // These tests verify basic router device availability.

  it("should get router device info", async () => {
    const info = await hb.g("/~router@1.0/info")
    assert.ok(info, "Router info should be returned")
    // Check for API documentation
    if (info.body && info.body.api) {
      assert.ok(info.body.api.info, "Should have info API")
    }
  })

  it("should get routes", async () => {
    const routes = await hb.g("/~router@1.0/routes")
    assert.ok(routes !== undefined, "Routes should be returned")
    // Routes may be empty object or contain pre-configured routes
    assert.equal(typeof routes, "object", "Routes should be an object")
  })
})
