import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { modIn, modOut } from "./lib/test-utils.js"
import { verify } from "../src/signer-utils.js"
import { HyperBEAM } from "../../src/test.js"
import { normalize } from "../src/erl_json.js"
import { createSigner } from "../src/signer.js"
import { send } from "../src/send.js"
import { erl_str_from, erl_str_to } from "../src/erl_str.js"

// Flat test cases that round-trip properly through HyperBEAM
// - ASCII-only string values (non-ASCII goes to body, not headers)
// - No keys that conflict with HTTP message fields (path, method, body, url)
// - No nested objects, arrays, or empty values that get transformed
const signerCases = [
  { key: "value" },
  { name: "test", version: "1.0" },
  { str: "hello world" },
  { num: "42" },
  { escaped: 'He said "Hello"' },
  { filepath: "/path/to/file.txt" },  // renamed from 'path' to avoid conflict
  { link: "https://example.com/path?query=value" },  // renamed from 'url'
  { a: "1", b: "2", c: "3" },
  { "x-custom": "header", "x-request-id": "12345" },
  { long: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
]

describe("Hyperbeam Signer", function () {
  let hbeam, sign
  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    sign = createSigner(hbeam.jwk, hbeam.url)
  })
  after(async () => hbeam.kill())

  it("should test signer", async () => {
    let err = []
    let success = []
    let i = 0
    for (const v of signerCases) {
      console.log(`[${++i}]...........................................`, v)
      try {
        const signed = await sign(
          { path: "/~hbsig@1.0/msg2", ...v },
          { path: false }
        )
        const result = await send(signed)
        // Use body directly for dev_hbsig endpoints that return #erl_response{...}
        const output = modOut(result.body)
        const exp = modIn(normalize(v))
        assert.deepEqual(exp, output)
        success.push(v)
      } catch (e) {
        console.log(e)
        err.push(v)
      }
    }
    console.log(`${err.length} / ${signerCases.length} failed!`)
    if (err.length > 0) {
      for (let v of err) console.log(v)
      throw new Error(`${err.length} / ${signerCases.length} test cases failed`)
    }
  })
})
