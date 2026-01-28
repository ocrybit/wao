import { send } from "../../src/send.js"
import { erl_json_to, normalize } from "../../src/erl_json.js"
import { erl_str_from } from "../../src/erl_str.js"
import assert from "assert"
import { describe, it, before, after } from "node:test"
import { HyperBEAM } from "wao/test"
import { createSigner } from "../../src/signer.js"

function mod(obj) {
  // Handle undefined - convert to string "undefined"
  if (obj === undefined) return "undefined"

  // Handle symbols - convert to their description or "symbol"
  if (typeof obj === "symbol") {
    const desc = obj.description || "symbol"
    // Special handling for symbols with descriptions that match special values
    if (desc === "null") return null
    if (desc === "undefined") return undefined
    if (desc === "true") return true
    if (desc === "false") return false
    return desc
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => mod(item))
  }

  // Handle binary data (Buffer, Uint8Array, etc.)
  if (
    obj instanceof Uint8Array ||
    obj instanceof ArrayBuffer ||
    Buffer.isBuffer(obj)
  ) {
    // Convert to empty string for empty buffers
    const buffer = Buffer.isBuffer(obj) ? obj : Buffer.from(obj)
    return buffer.length === 0 ? "" : buffer.toString("base64")
  }

  // Handle objects
  if (typeof obj === "object" && obj !== null) {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      // Lowercase the key when creating the result object
      result[key.toLowerCase()] = mod(value)
    }
    return result
  }

  // Handle strings - check if it's already an atom-like string
  if (typeof obj === "string" && obj.match(/^[a-z_][a-zA-Z0-9_]*$/)) {
    // This looks like an atom value, keep as is
    return obj
  }

  // Return primitive values as-is (strings, numbers, booleans, null)
  return obj
}

// Recursively transform values to match expected format, removing undefined values
function mod2(obj) {
  // Handle undefined - return undefined to signal removal
  if (obj === undefined) return undefined

  // Handle symbols - convert to their description or "symbol"
  if (typeof obj === "symbol") {
    const desc = obj.description || "symbol"
    // Special handling for symbols with descriptions that match special values
    if (desc === "null") return null
    if (desc === "undefined") return undefined // This will be removed
    if (desc === "true") return true
    if (desc === "false") return false
    return desc
  }

  // Handle arrays - filter out undefined values
  if (Array.isArray(obj)) {
    return obj.map(item => mod2(item)).filter(item => item !== undefined)
  }

  // Handle binary data (Buffer, Uint8Array, etc.)
  if (
    obj instanceof Uint8Array ||
    obj instanceof ArrayBuffer ||
    Buffer.isBuffer(obj)
  ) {
    // Convert to empty string for empty buffers
    const buffer = Buffer.isBuffer(obj) ? obj : Buffer.from(obj)
    return buffer.length === 0 ? "" : buffer.toString("base64")
  }

  // Handle objects - remove undefined properties
  if (typeof obj === "object" && obj !== null) {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      const modifiedValue = mod2(value)
      // Only add the property if the value is not undefined
      if (modifiedValue !== undefined) {
        // Lowercase the key when creating the result object
        result[key.toLowerCase()] = modifiedValue
      }
    }
    return result
  }

  // Handle strings - check if it's already an atom-like string
  if (typeof obj === "string" && obj.match(/^[a-z_][a-zA-Z0-9_]*$/)) {
    // This looks like an atom value, keep as is
    return obj
  }

  // Return primitive values as-is (strings, numbers, booleans, null)
  return obj
}

const test = async (sign, cases, path, mod = v => v, pmod = v => v) => {
  let err = []
  let success = []
  let i = 0
  for (const v of cases) {
    // Small delay between test cases to help with HyperBEAM stability
    await new Promise(resolve => setTimeout(resolve, 200))
    console.log(`[${++i}]...........................................`, v)
    let expected, output_b

    // Retry logic for flaky responses
    let lastError = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const _pmod = pmod(v)
        const json = erl_json_to(_pmod)
        const signed = await sign({ path, body: JSON.stringify(json) })
        const { out } = await send(signed)
        if (out === null || out === undefined) {
          throw new Error('Response body is null/undefined')
        }
        const input = normalize(_pmod)
        const output = erl_str_from(out)
        expected = normalize(mod(_pmod), true)
        output_b = erl_str_from(out, true)
        assert.deepEqual(expected, output_b)
        success.push(v)
        lastError = null
        break
      } catch (e) {
        lastError = e
        if (attempt < 3 && e.message === 'Response body is null/undefined') {
          console.log(`Attempt ${attempt} failed with null response, retrying...`)
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }
        break
      }
    }

    if (lastError) {
      console.log("EXPECTED:", JSON.stringify(expected, (k, v) => {
        if (Buffer.isBuffer(v)) return `<Buffer ${v.toString('hex')}>`
        if (typeof v === 'symbol') return `<Symbol ${Symbol.keyFor(v) || v.description}>`
        return v
      }, 2))
      console.log("ACTUAL:", JSON.stringify(output_b, (k, v) => {
        if (Buffer.isBuffer(v)) return `<Buffer ${v.toString('hex')}>`
        if (typeof v === 'symbol') return `<Symbol ${Symbol.keyFor(v) || v.description}>`
        return v
      }, 2))
      console.log("ERROR:", lastError.message)
      err.push(v)
    }
  }
  console.log(`${err.length} / ${cases.length} failed!`)
  if (err.length > 0) {
    for (let v of err) console.log(v)
    throw new Error(`${err.length} / ${cases.length} test cases failed`)
  }
}

const genTest = ({ desc = "HyperBEAM", its = [] }) => {
  describe(desc, function () {
    let hbeam, sign
    before(async () => {
      hbeam = await new HyperBEAM({ reset: true }).ready()
      sign = createSigner(hbeam.jwk, hbeam.url)
    })
    after(async () => hbeam.kill())
    for (const v of its) {
      it(
        v.it ?? "should run",
        async () =>
          await test(
            sign,
            v.cases,
            v.path ?? "/~hbsig@1.0/json_to_erl",
            v.mod,
            v.pmod
          )
      )
    }
  })
}

const modOut = out => {
  let output = erl_str_from(out)
  delete output.commitments
  delete output.path
  delete output.method
  delete output["content-length"]
  delete output["content-type"]
  delete output["inline-body-key"]
  return output
}
const modIn = inp => {
  let inp2 = normalize(inp)

  // Recursive function to lowercase all object keys and convert empty strings to Buffer
  const lowercaseKeys = obj => {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj
    }

    // Handle empty strings - convert to empty Buffer
    if (obj === "") {
      return Buffer.from([])
    }

    // Handle arrays - recurse on each element
    if (Array.isArray(obj)) {
      return obj.map(item => lowercaseKeys(item))
    }

    // Handle objects - lowercase keys and recurse on values
    if (typeof obj === "object" && obj.constructor === Object) {
      const result = {}
      for (const [key, value] of Object.entries(obj)) {
        // Lowercase the key and recurse on the value
        result[key.toLowerCase()] = lowercaseKeys(value)
      }
      return result
    }

    // Return other primitive values as-is
    return obj
  }

  return lowercaseKeys(inp2)
}
export { mod, mod2, test, genTest, modOut, modIn }
