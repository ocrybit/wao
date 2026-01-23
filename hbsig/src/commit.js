import { id, base, hashpath, rsaid, hmacid } from "./id.js"
import { toAddr } from "./utils.js"
import { extractPubKey } from "./signer-utils.js"
import { verify } from "./signer-utils.js"

/**
 * Parse a structured field list string back into an array
 * Reverses the encoding done by encodeAsStructuredFieldList in signer.js
 *
 * Format: `"value1", "value2", 123, ?1, :base64:`
 * Returns: ["value1", "value2", 123, true, <Buffer>]
 */
function parseStructuredFieldList(str) {
  if (!str || typeof str !== "string") return str

  const result = []
  let i = 0

  while (i < str.length) {
    // Skip whitespace and commas
    while (i < str.length && (str[i] === " " || str[i] === "," || str[i] === "\t")) {
      i++
    }
    if (i >= str.length) break

    // Check what type of value this is
    if (str[i] === '"') {
      // Quoted string
      i++ // skip opening quote
      let value = ""
      while (i < str.length && str[i] !== '"') {
        if (str[i] === "\\" && i + 1 < str.length) {
          // Escape sequence
          i++
          value += str[i]
        } else {
          value += str[i]
        }
        i++
      }
      i++ // skip closing quote
      result.push(value)
    } else if (str[i] === "?") {
      // Boolean
      i++ // skip ?
      if (str[i] === "1") {
        result.push(true)
      } else {
        result.push(false)
      }
      i++
    } else if (str[i] === ":") {
      // Binary data (base64)
      i++ // skip opening colon
      let base64 = ""
      while (i < str.length && str[i] !== ":") {
        base64 += str[i]
        i++
      }
      i++ // skip closing colon
      result.push(Buffer.from(base64, "base64"))
    } else if (/[0-9-]/.test(str[i])) {
      // Number
      let numStr = ""
      while (i < str.length && /[0-9.\-eE+]/.test(str[i])) {
        numStr += str[i]
        i++
      }
      const num = numStr.includes(".") ? parseFloat(numStr) : parseInt(numStr, 10)
      result.push(num)
    } else {
      // Unknown, skip to next comma
      while (i < str.length && str[i] !== ",") {
        i++
      }
    }
  }

  return result
}

/**
 * Check if a string looks like a structured field list
 * Used to detect arrays that were encoded without ao-types "list" marker
 *
 * Pattern examples:
 * - "value1", "value2" (quoted strings separated by comma-space)
 * - 123, 456 (numbers)
 * - ?0, ?1 (booleans)
 */
function isStructuredFieldList(str) {
  if (!str || typeof str !== "string") return false

  // Must have at least 2 items (indicated by comma)
  if (!str.includes(",")) return false

  const trimmed = str.trim()

  // Check for quoted string list pattern: "value1", "value2"
  // Use a more permissive regex that handles various characters in values
  if (/^"[^"]*"(\s*,\s*"[^"]*")+$/.test(trimmed)) {
    return true
  }

  // Check for number list pattern: 123, 456
  if (/^-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)+$/.test(trimmed)) {
    return true
  }

  // Check for boolean list pattern: ?0, ?1
  if (/^\?[01](\s*,\s*\?[01])+$/.test(trimmed)) {
    return true
  }

  // Check for mixed pattern starting with quote
  // This catches arrays like: "value", 123, ?1
  if (trimmed.startsWith('"') && trimmed.includes('",')) {
    return true
  }

  return false
}

/**
 * Check if a string looks like a structured field dictionary
 * Dictionary format: 1="value1", 2="value2", 3="value3"
 * Used for device-stack and similar fields
 */
function isStructuredFieldDictionary(str) {
  if (!str || typeof str !== "string") return false

  const trimmed = str.trim()

  // Dictionary pattern: 1="value", 2="value" (numeric keys with quoted/unquoted values)
  // Each item is: key=value where key is numeric
  if (/^\d+=/.test(trimmed)) {
    return true
  }

  return false
}

/**
 * Parse a structured field dictionary string into a numbered map
 * Input: '1="wasi@1.0", 2="json-iface@1.0"'
 * Output: {"1": "wasi@1.0", "2": "json-iface@1.0"}
 */
function parseStructuredFieldDictionary(str) {
  if (!str || typeof str !== "string") return {}

  const result = {}
  // Match pattern: key=value where value can be quoted string, number, boolean, or binary
  const regex = /(\d+)=(?:"([^"\\]*(?:\\.[^"\\]*)*)"|:([^:]+):|(\?[01])|(-?\d+(?:\.\d+)?))/g
  let match

  while ((match = regex.exec(str)) !== null) {
    const key = match[1]
    if (match[2] !== undefined) {
      // Quoted string - unescape
      result[key] = match[2].replace(/\\(.)/g, '$1')
    } else if (match[3] !== undefined) {
      // Binary (base64)
      result[key] = Buffer.from(match[3], "base64")
    } else if (match[4] !== undefined) {
      // Boolean
      result[key] = match[4] === "?1"
    } else if (match[5] !== undefined) {
      // Number
      result[key] = match[5].includes(".") ? parseFloat(match[5]) : parseInt(match[5], 10)
    }
  }

  return result
}

/**
 * Known field names that should be sent as numbered maps (1-indexed)
 * HyperBEAM expects these as maps like {"1": "val1", "2": "val2"}, not arrays
 */
const NUMBERED_MAP_FIELDS = new Set([
  "device-stack",
  "as", // genesis-wasm tag
])

/**
 * Parse signature header into individual signatures
 * Format: "name1=:base64sig1:, name2=:base64sig2:"
 * Returns: { name1: "base64sig1", name2: "base64sig2" }
 */
function parseSignatures(signatureHeader) {
  const signatures = {}
  // Match pattern: name=:base64value:
  const regex = /([a-zA-Z0-9_-]+)=:([^:]+):/g
  let match
  while ((match = regex.exec(signatureHeader)) !== null) {
    signatures[match[1]] = match[2]
  }
  return signatures
}

/**
 * Parse signature-input header into individual inputs
 * Format: "name1=(components);params, name2=(components);params"
 * Returns: { name1: "(components);params", name2: "(components);params" }
 */
function parseSignatureInputs(signatureInputHeader) {
  const inputs = {}
  // Split by comma followed by a signature name
  const parts = signatureInputHeader.split(/,\s*(?=[a-zA-Z0-9_-]+=)/)
  for (const part of parts) {
    const match = part.trim().match(/^([a-zA-Z0-9_-]+)=(.+)$/)
    if (match) {
      inputs[match[1]] = match[2]
    }
  }
  return inputs
}

/**
 * Parse ao-types header to get field type mappings
 * Format: 'field1="type1", field2="type2"'
 * Returns: { field1: "type1", field2: "type2" }
 */
function parseAoTypes(aoTypesHeader) {
  if (!aoTypesHeader) return {}
  const types = {}
  // Match pattern: fieldname="typename"
  const regex = /([a-zA-Z0-9_-]+)="([^"]+)"/g
  let match
  while ((match = regex.exec(aoTypesHeader)) !== null) {
    types[match[1]] = match[2]
  }
  return types
}

// todo: handle @
export const commit = async (obj, opts) => {
  const msg = await opts.signer(obj, opts)
  const {
    decodedSignatureInput: { components },
  } = await verify(msg)

  let body = {}

  // Check for inline-body-key
  const inlineBodyKey = msg.headers["inline-body-key"]

  // Build body from components (signed fields)
  for (const v of components) {
    const key = v === "@path" ? "path" : v
    body[key] = msg.headers[key]
  }

  // Also include non-signed fields (like list fields) in the body
  // These headers should be in the message but are not cryptographically committed
  const excludedHeaders = new Set([
    "signature",
    "signature-input",
    "content-digest",
    "content-length",
    "content-type",
    "body-keys",
    "inline-body-key",
    "path", // Don't include path in body - it's for routing only
  ])
  for (const [key, value] of Object.entries(msg.headers)) {
    if (!body.hasOwnProperty(key) && !excludedHeaders.has(key) && value !== undefined) {
      body[key] = value
    }
  }

  // Handle body resolution
  if (msg.body) {
    let bodyContent

    if (msg.body instanceof Blob) {
      const arrayBuffer = await msg.body.arrayBuffer()
      bodyContent = Buffer.from(arrayBuffer)
    } else {
      bodyContent = msg.body
    }

    // If inline-body-key is "data", put content in data field
    if (inlineBodyKey === "data") {
      body.data = bodyContent
    } else {
      body.body = bodyContent
    }
  }

  // Remove inline-body-key from the final body as it's just metadata
  delete body["inline-body-key"]

  const hmacId = hmacid(msg.headers)
  const rsaId = rsaid(msg.headers)
  const pub = extractPubKey(msg.headers)
  const committer = toAddr(pub.toString("base64"))

  // Parse signatures and signature-inputs to extract individual components
  const signatures = parseSignatures(msg.headers.signature)
  const signatureInputs = parseSignatureInputs(msg.headers["signature-input"])

  // Find the signature name (they share the same name)
  const sigName = Object.keys(signatures)[0]

  // Parse ao-types to identify fields explicitly marked as "list"
  // These are excluded from committedKeys since HyperBEAM converts them to +link references
  const aoTypes = parseAoTypes(msg.headers["ao-types"])
  const explicitListFields = new Set(
    Object.entries(aoTypes)
      .filter(([_, type]) => type === "list")
      .map(([field, _]) => field)
  )

  // Track which fields were converted from structured field lists
  const detectedArrayFields = new Set()

  // Convert structured field strings to proper format
  // NUMBERED_MAP_FIELDS (like device-stack) are kept as dictionary strings in the JSON body
  // This ensures the JSON value matches the signed header value for commitment verification
  // HyperBEAM's structured codec will parse the dictionary string back to a map
  // Other list fields get converted to arrays
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      // NUMBERED_MAP_FIELDS stay as dictionary strings - don't convert!
      // The dictionary format (1="val1", 2="val2") is kept as-is so it matches
      // the signed value. HyperBEAM's structured codec parses it to a map.
      if (NUMBERED_MAP_FIELDS.has(key)) {
        // Keep as string - don't convert to numbered map
        // This ensures the JSON value matches the signed header value
        continue
      }

      // Check if this should be converted to an array
      const shouldConvert =
        explicitListFields.has(key) ||
        isStructuredFieldList(value)

      if (shouldConvert) {
        body[key] = parseStructuredFieldList(value)
        if (!explicitListFields.has(key)) {
          detectedArrayFields.add(key)
        }
      }
    }
  }

  // Beta3 requires 'committed' array listing the signed keys in each commitment
  // Exclude both explicit list fields AND detected array fields from committedKeys
  // because HyperBEAM converts arrays to +link references, which breaks commitment validation
  // (the signed value was a string, but actual value becomes a link)
  // Also exclude inline-body-key as it's metadata that gets removed from the final body
  const metadataFields = new Set(["inline-body-key"])

  // HTTP pseudo-header fields that conflict with RFC 9421 signature verification
  // "authority" conflicts with the HTTP :authority pseudo-header
  // "content-digest" conflicts when using commit + JSON POST (different HTTP body)
  const httpPseudoHeaders = new Set(["authority", "content-digest"])

  // Check if ao-types contains any "list" declarations
  // If so, exclude ao-types from committed fields because HyperBEAM may modify list values
  const hasListTypes = explicitListFields.size > 0 || detectedArrayFields.size > 0

  const committedKeys = components
    .map(v => (v === "@path" ? "path" : v))
    .filter(key =>
      !explicitListFields.has(key) &&
      !detectedArrayFields.has(key) &&
      !metadataFields.has(key) &&
      !httpPseudoHeaders.has(key) &&
      !(key === "ao-types" && hasListTypes)
    )

  // NOTE: NUMBERED_MAP_FIELDS (device-stack, as) are now INCLUDED in committedKeys!
  // They are encoded as dictionary strings (1="val1", 2="val2") without "map" type
  // in ao-types, so they stay as strings and don't get linkified by HyperBEAM.
  // The scheduler's with_only_committed will preserve them because they're in committed.
  // dev_stack.erl will parse the dictionary string when it accesses device-stack.

  // Beta3: Create single RSA commitment
  // The HMAC signature is server-side only (for "constant:ao" keyid)
  // Extract keyid from the public key (with publickey: prefix for beta3)
  // Note: HyperBEAM's apply_scheme uses base64:decode which expects standard base64
  const keyid = `publickey:${pub.toString("base64")}`

  const committed = {
    commitments: {
      [rsaId]: {
        type: "rsa-pss-sha512",
        alg: "rsa-pss-sha512", // Include both for HyperBEAM compatibility
        "commitment-device": "httpsig@1.0",
        committer,
        committed: committedKeys,
        keyid,
        signature: signatures[sigName],
        "signature-input": signatureInputs[sigName],
      },
    },
    ...body,
  }
  return committed
}
