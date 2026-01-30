import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { modIn, modOut } from "./lib/test-utils.js"
import { verify } from "../src/signer-utils.js"
import { HyperBEAM } from "wao/test"
import cases, { errors, never_tested } from "./lib/cases.js"
import { normalize } from "../src/erl_json.js"
import { createSigner } from "../src/signer.js"
import { send } from "../src/send.js"
import { erl_str_from, erl_str_to } from "../src/erl_str.js"

// Helper to run test cases
const runCases = async (sign, testCases) => {
  let err = []
  let success = []
  let i = 0
  for (const v of testCases) {
    console.log(`[${++i}]...........................................`, v)
    try {
      const signed = await sign(
        { path: "/~hbsig@1.0/msg2", ...v },
        { path: false }
      )
      const { out } = await send(signed)
      const output = modOut(out)
      const exp = modIn(normalize(v))
      assert.deepEqual(exp, output)
      success.push(v)
    } catch (e) {
      console.log(e)
      err.push(v)
    }
  }
  console.log(`${err.length} / ${testCases.length} failed!`)
  if (err.length > 0) {
    for (let v of err) console.log(v)
    throw new Error(`${err.length} test case(s) failed`)
  }
}

describe("Hyperbeam Signer", function () {
  let hbeam, sign
  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    sign = createSigner(hbeam.jwk, hbeam.url)
  })
  after(async () => hbeam.kill())

  // === PASSING TESTS ===
  it("should test signer (passing cases)", async () => {
    await runCases(sign, cases)
  })

  // === PENDING TESTS (buffer issues - should be fixed) ===
  it.skip("[PENDING] signer - buffer cases (18 cases to fix)", async () => {
    await runCases(sign, errors)
  })

  // === NEVER TESTED (edge cases - not in original test suite) ===
  it.skip("[NEVER] signer - edge cases (case collision, large int, etc)", async () => {
    await runCases(sign, never_tested)
  })
})
