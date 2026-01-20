import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { acc } from "../../../src/test.js"
import HB from "../../../src/hb.js"
import HyperBEAM from "../../../src/hyperbeam.js"

let operator = null
let user = acc[0]

describe("Hyperbeam Simple Pay", function () {
  let hbeam

  before(async () => {
    hbeam = await new HyperBEAM({
      operator: HyperBEAM.OPERATOR,
      simple_pay: true,
      simple_pay_price: 2,
      reset: true,
      timeout: 60,
    }).ready()
  })

  beforeEach(async () => {
    operator = hbeam
    user.hb = await new HB({}).init(user.jwk)
  })

  after(async () => {
    hbeam.kill()
  })

  // Note: Full simple-pay tests require:
  // - Modifying meta@1.0/info (returns 400 in beta3)
  // - Payment charging logic
  // These tests verify basic server functionality with simple_pay enabled.

  it("should have server running with simple_pay", async () => {
    const info = await operator.hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond")
    assert.equal(info.port, 10001, "Port should be 10001")
  })

  it("should allow GET requests", async () => {
    const msg = ["/~message@1.0/set/hello", { hello: "world" }]
    const result = await operator.hb.g(...msg)
    assert.ok(result, "GET should succeed")
  })
})
