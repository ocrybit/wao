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

  // If object contains binary data, use enc() directly
  if (hasBinaryData(filtered)) {
    return await enc(filtered)
  }

  // Only add path if explicitly provided
  let fields = { ...filtered }
  if (path) fields.path = path

  // Try the standard encoding pipeline
  const encoded = httpsig_to(normalize(structured_from(normalize(fields))))

  // Check if the encoded result is valid for HTTP headers
  if (!isValid(encoded)) {
    // If invalid, fall back to enc()
    return await enc(filtered)
  }

  // For non-binary data, return in the same format as enc()
  // httpsig_to returns a flattened object, so we need to separate headers and body
  const { body, ...headers } = encoded
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

  // Only add path header if it's a data field (doesn't start with "/").
  // URL paths (like "/relay/process") should NOT be added to headers.
  // Data fields named "path" (e.g., "credit-notice") should be signed.
  const isDataFieldPath = path && typeof path === "string" && !path.startsWith("/")
  if (isDataFieldPath && !headersObj["path"]) headersObj["path"] = path

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
  // - accept-bundle: request metadata for inlining nested data
  // - content-digest: only exclude when no body; when body exists, sign it so
  //   HyperBEAM can map content-digest → body → ao-body-key field in committed list
  // Note: "path" as a data field (e.g., path: "credit-notice") should be signed.
  // The @path derived component (HTTP request URL) is handled separately.
  const metadataFields = ["body-keys", "ao-types", "accept-bundle", "content-length"]
  if (!body) {
    metadataFields.push("content-digest")
  }
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

// Pre-convert specific array fields (like device-stack) to RFC 8941 string format
// so they are encoded as header values (committed/signed) rather than multipart body parts.
// HyperBEAM's dev_hbsig hot-patch will parse these strings back to maps for dev_stack.
const STACK_ARRAY_FIELDS = ["device-stack"]
const preprocessStackArrays = obj => {
  let hasChanges = false
  for (const field of STACK_ARRAY_FIELDS) {
    if (Array.isArray(obj[field]) && isSimpleArray(obj[field])) {
      hasChanges = true
      break
    }
  }
  if (!hasChanges) return obj
  const result = { ...obj }
  for (const field of STACK_ARRAY_FIELDS) {
    if (Array.isArray(result[field]) && isSimpleArray(result[field])) {
      result[field] = encodeAsStructuredFieldList(result[field])
    }
  }
  return result
}

export function signer(config) {
  const { signer, url = "http://localhost:10001" } = config
  if (!signer) throw new Error("Signer is required for mainnet mode")
  return async (
    fields,
    { encoded: _encoded = false, path: signPath = true } = {}
  ) => {
    const { method = "POST", ...restFields } = fields

    // Distinguish URL paths from data fields:
    // - URL paths start with "/" (e.g., "/relay/process")
    // - Data fields don't (e.g., "credit-notice" for P4 ledger actions)
    const fieldsPath = restFields.path
    const isUrlPath = typeof fieldsPath === "string" && fieldsPath.startsWith("/")
    const path = isUrlPath ? fieldsPath : "/relay/process"

    // Keep path in data fields if it's not a URL path
    let aoFields
    if (isUrlPath) {
      const { path: _, ...rest } = restFields
      aoFields = rest
    } else {
      aoFields = restFields  // path stays as data field
    }

    const filteredFields = filterUndefined(aoFields)
    // Pre-convert device-stack arrays to RFC 8941 strings before encoding
    const preprocessed = preprocessStackArrays(filteredFields)
    // Never pass path to encode():
    // - If isUrlPath is true (e.g., "/~scheduler@1.0/schedule"): path is only for
    //   HTTP request routing, not a data field to sign
    // - If isUrlPath is false (e.g., "credit-notice"): path is already in aoFields
    //   as a data field, so encode() will process it naturally
    const encoded = _encoded
      ? filteredFields
      : await encode(preprocessed, null)
    return await _sign({ path, signPath, method, encoded, signer, url })
  }
}

export const createSigner = (jwk, url) => {
  const _signer = _createSigner(jwk, url)
  return signer({ signer: _signer, url })
}
