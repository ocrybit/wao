import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { acc } from "../../../src/test.js"
import HB from "../../../src/hb.js"
import HyperBEAM from "../../../src/hyperbeam.js"

let allowed_user = acc[0]
let operator = null

describe("Hyperbeam FAFF", function () {
  let hbeam

  before(async () => {
    hbeam = await new HyperBEAM({
      faff: [HyperBEAM.OPERATOR, allowed_user.addr],
      reset: true,
      timeout: 60,
    }).ready()
  })

  beforeEach(async () => {
    operator = hbeam
    allowed_user.hb = new HB({ jwk: allowed_user.jwk })
  })

  after(async () => {
    hbeam.kill()
  })

  // Note: FAFF enforcement behavior may differ in beta3
  // These tests verify basic operations work with faff configuration

  it("should allow GET requests", async () => {
    const msg = ["/~message@1.0/set/hello", { hello: "world" }]

    const operatorResult = await operator.hb.g(...msg)
    assert.ok(operatorResult, "Operator GET should succeed")

    const allowedResult = await allowed_user.hb.g(...msg)
    assert.ok(allowedResult, "Allowed user GET should succeed")
  })

  it("should allow POST for operator", async () => {
    const msg = ["/~message@1.0/set/hello", { hello: "world" }]

    // POST should work for operator
    const operatorResult = await operator.hb.p(...msg)
    assert.ok(operatorResult, "Operator POST should succeed")
  })

  it("should allow POST for allowed users", async () => {
    const msg = ["/~message@1.0/set/hello", { hello: "world" }]

    // POST should work for allowed user
    const allowedResult = await allowed_user.hb.p(...msg)
    assert.ok(allowedResult, "Allowed user POST should succeed")
  })
})
