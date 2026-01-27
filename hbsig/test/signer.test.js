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
// (no arrays, nested objects, or empty values that get transformed)
const signerCases = [
  { key: "value" },
  { name: "test", version: "1.0" },
  { str: "hello world" },
  { num: "42" },
  { unicode: "Hello 世界" },
  { escaped: 'He said "Hello"' },
  { path: "/path/to/file.txt" },
  { url: "https://example.com/path?query=value" },
  { binary: Buffer.from([1, 2, 3]) },
  { text: Buffer.from("Hello World") },
  { mixed: "string", bin: Buffer.from([255, 0, 128]) },
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
    console.log(`${err.length} / ${signerCases.length} failed!`)
    if (err.length > 0) {
      for (let v of err) console.log(v)
      throw new Error(`${err.length} / ${signerCases.length} test cases failed`)
    }
  })
})
