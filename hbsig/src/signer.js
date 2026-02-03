import { httpsig_from, httpsig_to } from "./httpsig.js"
import { structured_from, structured_to } from "./structured.js"
import { erl_json_from, erl_json_to, normalize } from "./erl_json.js"
import { enc } from "./encode.js"
import { isBytes } from "./encode-utils.js"
import { createSigner as _createSigner } from "@permaweb/aoconnect"
import { toHttpSigner } from "./send.js"

// Export verify from signer-utils.js for compatibility
export { verify } from "./signer-utils.js"

// Helper to check if an array contains binary data
const arrayHasBinaryData = arr => {
  if (!Array.isArray(arr)) return false

  return arr.some(item => {
    if (isBytes(item)) return true
    if (Array.isArray(item)) return arrayHasBinaryData(item)
    return false
  })
}

// Helper to check if a string contains non-printable characters
const hasNonPrintableChars = str => {
  if (typeof str !== "string") return false

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // Allow only printable ASCII (32-126)
    // Note: tabs (9), newlines (10), and carriage returns (13) are not allowed in HTTP headers
    if (code < 32 || code > 126) {
      return true
    }
  }
  return false
}

// Helper to encode a string as a structured field byte sequence
// Format: :base64data: (RFC 8941)
const encodeAsByteSequence = str => {
  const buffer = Buffer.from(str, "utf-8")
  return `:${buffer.toString("base64")}:`
}

const isValid = encoded => {
  if (!encoded || typeof encoded !== "object") return false

  // Check if all header values are valid for HTTP headers
  for (const [key, value] of Object.entries(encoded)) {
    if (key === "body") {
      // Body can be string, Buffer, or undefined
      if (
        value !== undefined &&
        typeof value !== "string" &&
        !Buffer.isBuffer(value)
      ) {
        return false
      }
    } else {
      // All other fields (headers) must be strings or numbers
      if (typeof value !== "string" && typeof value !== "number") {
        // Check for Buffer in headers - this will fail HTTP signing
        if (Buffer.isBuffer(value) || isBytes(value)) {
          return false
        }
        return false
      }

      // Check if string contains non-printable characters
      if (typeof value === "string" && hasNonPrintableChars(value)) {
        return false
      }
    }
  }

  return true
}

// Check if object contains any binary data or arrays with binary data
const hasBinaryData = obj => {
  for (const [key, value] of Object.entries(obj)) {
    if (key === "path") continue

    if (isBytes(value)) {
      return true
    } else if (Array.isArray(value) && arrayHasBinaryData(value)) {
      return true
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // Check nested objects
      for (const [k, v] of Object.entries(value)) {
        if (isBytes(v)) {
          return true
        } else if (Array.isArray(v) && arrayHasBinaryData(v)) {
          return true
        }
      }
    }
  }
  return false
}

// Helper to check if value is a simple array that should use structured fields
const isSimpleArray = value => {
  if (!Array.isArray(value)) return false

  return value.every(item => {
    // Simple types that can be in structured field lists
    if (typeof item === "string") return true
    if (typeof item === "number") return true
    if (typeof item === "boolean") return true
    if (isBytes(item)) return true

    // Complex types cannot be in structured field lists
    if (item && typeof item === "object") return false

    return true
  })
}

// Helper to encode array as structured field list
const encodeAsStructuredFieldList = arr => {
  return arr
    .map(item => {
      if (typeof item === "string") {
        // String values are quoted
        return `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
      } else if (typeof item === "number") {
        // Numbers are bare
        return String(item)
      } else if (typeof item === "boolean") {
        // Booleans use ?0 or ?1
        return item ? "?1" : "?0"
      } else if (isBytes(item)) {
        // Binary data as byte sequences
        const buffer = Buffer.isBuffer(item) ? item : Buffer.from(item)
        return `:${buffer.toString("base64")}:`
      } else {
        // Fallback
        return `"${String(item)}"`
      }
    })
    .join(", ")
}

const smartSign = async (obj, path) => {
  try {
    // Filter out undefined values
    const filtered = filterUndefined(obj)

    // Check if we can encode everything as headers (no multipart needed)
    let canUseSimpleEncoding = true
    let hasBodyField = false

    for (const [key, value] of Object.entries(filtered)) {
      if (key === "path") continue

      // Check if this is the "body" field
      if (key === "body" || key === "data") {
        hasBodyField = true
        // Only use multipart if body/data is non-empty binary
        if (isBytes(value) && value.length > 0) {
          canUseSimpleEncoding = false
          break
        }
      }

      // Non-empty buffers in any key need multipart (they can't be HTTP headers)
      if (isBytes(value) && value.length > 0) {
        canUseSimpleEncoding = false
        break
      }

      // Complex nested objects need multipart
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !isBytes(value)
      ) {
        if (Object.keys(value).length > 0) {
          canUseSimpleEncoding = false
          break
        }
      }

      // Arrays with complex items need multipart
      if (Array.isArray(value) && !isSimpleArray(value)) {
        canUseSimpleEncoding = false
        break
      }
    }

    if (canUseSimpleEncoding) {
      // Build a simple message that won't trigger multipart
      const message = {}
      if (path) message.path = path

      const types = []

      for (const [key, value] of Object.entries(filtered)) {
        if (key === "path") continue

        if (value === "" || (Buffer.isBuffer(value) && value.length === 0)) {
          // Empty string/buffer - just include key with empty value, no type annotation needed
          message[key] = ""
        } else if (Array.isArray(value) && value.length === 0) {
          // Empty array - use "list" type annotation
          types.push(`${key}="list"`)
          message[key] = ""
        } else if (
          value &&
          typeof value === "object" &&
          !Buffer.isBuffer(value) &&
          Object.keys(value).length === 0
        ) {
          // Empty object - use "map" type annotation
          types.push(`${key}="map"`)
          message[key] = ""
        } else if (isSimpleArray(value)) {
          types.push(`${key}="list"`)
          message[key] = encodeAsStructuredFieldList(value)
        } else if (typeof value === "number") {
          types.push(
            `${key}="${Number.isInteger(value) ? "integer" : "float"}"`
          )
          message[key] = String(value)
        } else if (typeof value === "boolean") {
          types.push(`${key}="atom"`)
          message[key] = String(value)
        } else if (value === null || value === undefined) {
          types.push(`${key}="atom"`)
          message[key] = String(value)
        } else if (typeof value === "string") {
          // Check if string has non-printable characters (like newlines in Lua code)
          // If so, encode as structured field byte sequence format: :base64:
          // This allows the value to be a valid HTTP header and thus be signed
          if (hasNonPrintableChars(value)) {
            types.push(`${key}="binary"`)
            message[key] = encodeAsByteSequence(value)
          } else {
            message[key] = value
          }
        }
      }

      if (types.length > 0) {
        message["ao-types"] = types.join(", ")
      }

      return httpsig_to(message)
    }

    // For complex structures that need multipart, use enc()
    const normalized = normalize({
      ...filtered,
      ...(path && { path }),
    })
    const result = await enc(normalized)

    // enc() returns { headers: {...}, body: ... }
    // We need to flatten this for httpsig_to
    const flattened = {
      ...result.headers,
      body: result.body,
      ...(path && { path }),
    }

    // httpsig_to expects the structured format
    const encoded = httpsig_to(flattened)

    return encoded
  } catch (error) {
    console.error("Encoding failed:", error)

    // Fallback: create a simple structure
    const result = {}
    if (path) result.path = path

    for (const [key, value] of Object.entries(obj)) {
      if (key === "path") continue

      if (!isBytes(value) && value !== undefined) {
        result[key] = value
      }
    }

    return result
  }
}

// Internal encode function that uses the original impl as much as possible
const encode = async (obj, path) => {
  // Filter out undefined values before processing
  const filtered = filterUndefined(obj)

  console.log("[ENCODE DEBUG] encode() called with keys:", Object.keys(filtered))
  console.log("[ENCODE DEBUG] data exists:", !!filtered.data, "data length:", filtered.data?.length)

  // If object contains binary data, use enc() directly
  if (hasBinaryData(filtered)) {
    // For binary data, use enc() which handles multipart
    console.log("[ENCODE DEBUG] Using enc() for binary data")
    return await enc(filtered)
  }

  // Check if any string values have non-printable characters (like newlines in Lua code)
  // For such strings, we put them directly in the body (not multipart) with inline-body-key
  // This is compatible with HyperBEAM's JSON codec which expects inline body content
  const complexStringFields = Object.entries(filtered).filter(([key, value]) =>
    typeof value === "string" && hasNonPrintableChars(value)
  )

  console.log("[ENCODE DEBUG] complexStringFields:", complexStringFields.map(([k]) => k))

  if (complexStringFields.length > 0) {
    // Complex strings with newlines - use enc() for multipart encoding
    // This puts the complex content in the HTTP body, not headers
    // The body content is NOT part of the signed fields, but uses inline-body-key
    console.log("[ENCODE DEBUG] Using enc() for complex string fields:", complexStringFields.map(([k]) => k))
    return await enc(filtered)
  }

  // Otherwise use the standard pipeline for simple flat messages
  let fields = { ...filtered }
  // Only add path if explicitly provided
  if (path) fields.path = path

  // Try the standard encoding pipeline for messages without complex strings
  const encoded = httpsig_to(normalize(structured_from(normalize(fields))))
  console.log(`[ENCODE DEBUG] After pipeline, data field: ${encoded.data?.substring?.(0, 50) || encoded.data}`)

  // Check if the encoded result is valid for HTTP headers
  if (!isValid(encoded)) {
    // If invalid, fall back to enc()
    console.log("[ENCODE DEBUG] isValid failed, falling back to enc()")
    return await enc(filtered)
  }

  // For non-binary data, return in the same format as enc()
  // httpsig_to returns a flattened object, so we need to separate headers and body
  const { body, ...headers } = encoded
  console.log(`[ENCODE DEBUG] Final headers.data: ${headers.data?.substring?.(0, 50) || headers.data}`)
  return { headers, body }
}

// Helper to join URL and path
const joinUrl = ({ url, path }) => {
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const normalizedPath = path.startsWith("/") ? path : "/" + path
  return url.endsWith("/")
    ? url.slice(0, -1) + normalizedPath
    : url + normalizedPath
}

// Main sign function that matches signer.js API
export async function sign({ url, path, msg: encoded, jwk, signPath = true }) {
  const signer = _createSigner(jwk, url)
  const { body = null, ...headers } = encoded
  let _enc = { headers }
  if (body) _enc.body = new Blob([body])
  return await _sign({ path, signPath, encoded, signer, url })
}

// Helper function to recursively filter out undefined values
const filterUndefined = obj => {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) {
    return obj.map(filterUndefined).filter(item => item !== undefined)
  }
  if (typeof obj === "object" && obj.constructor === Object) {
    const filtered = {}
    for (const [key, value] of Object.entries(obj)) {
      const filteredValue = filterUndefined(value)
      if (filteredValue !== undefined) {
        filtered[key] = filteredValue
      }
    }
    return filtered
  }
  return obj
}

async function _sign({
  path,
  signPath = true,
  method = "POST",
  encoded,
  signer,
  url,
}) {
  const headersObj = encoded ? encoded.headers : {}
  const body = encoded ? encoded.body : undefined
  let url_path = typeof signPath === "string" ? signPath : path
  const _url = joinUrl({ url, path: url_path })

  // Only add path header if path is provided
  if (path) headersObj["path"] = path

  // Add accept-bundle header to request inline data instead of links
  headersObj["accept-bundle"] = "true"

  if (body && !headersObj["content-length"]) {
    const bodySize = body.size || body.byteLength || 0
    if (bodySize > 0) headersObj["content-length"] = String(bodySize)
  }

  const lowercaseHeaders = {}
  for (const [key, value] of Object.entries(headersObj)) {
    lowercaseHeaders[key.toLowerCase()] = value
  }

  const bodyKeys = headersObj["body-keys"]
    ? headersObj["body-keys"]
        .replace(/"/g, "")
        .split(",")
        .map(k => k.trim())
    : []

  // Exclude metadata fields that get consumed/stripped during JSON codec parsing:
  // - ao-types: used for type conversion, then removed by structured codec
  // - content-digest: HyperBEAM recomputes this during verification, so don't sign it
  // - accept-bundle: request metadata for inlining nested data
  // These fields are still included in the JSON body but not signed
  const metadataFields = ["body-keys", "path", "ao-types", "content-digest", "accept-bundle"]
  let isPath = false
  const signingFields = Object.keys(lowercaseHeaders).filter(key => {
    if (key === "path") isPath = true
    return !metadataFields.includes(key) && !bodyKeys.includes(key)
  })

  // Only add @path if signPath is enabled AND path header exists
  if (signPath !== false && isPath) signingFields.push("@path")

  const signedRequest = await toHttpSigner(signer)({
    request: { url: _url, method, headers: lowercaseHeaders },
    fields: signingFields,
  })

  const finalHeaders = {}
  for (const [key, value] of Object.entries(headersObj)) {
    finalHeaders[key] = value
  }

  finalHeaders["signature"] = signedRequest.headers["signature"]
  finalHeaders["signature-input"] = signedRequest.headers["signature-input"]

  if (headersObj["body-keys"]) {
    finalHeaders["body-keys"] = headersObj["body-keys"]
  }

  const result = { url: _url, method, headers: finalHeaders }
  if (body) result.body = body

  return result
}

export function signer(config) {
  const { signer, url = "http://localhost:10001" } = config
  if (!signer) throw new Error("Signer is required for mainnet mode")
  return async (
    fields,
    { encoded: _encoded = false, path: signPath = true } = {}
  ) => {
    const { path = "/relay/process", method = "POST", ...aoFields } = fields
    const filteredFields = filterUndefined(aoFields)
    const encoded = _encoded
      ? filteredFields
      : await encode(filteredFields, path)
    return await _sign({ path, signPath, method, encoded, signer, url })
  }
}

export const createSigner = (jwk, url) => {
  const _signer = _createSigner(jwk, url)
  return signer({ signer: _signer, url })
}
