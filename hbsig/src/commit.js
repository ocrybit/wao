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

  // Parse ao-types to identify list fields that should be excluded from committed keys
  // HyperBEAM converts arrays to +link references, which would cause commitment validation to fail
  const aoTypes = parseAoTypes(msg.headers["ao-types"])
  const listFields = new Set(
    Object.entries(aoTypes)
      .filter(([_, type]) => type === "list")
      .map(([field, _]) => field)
  )

  // Convert list fields from structured field strings to proper arrays
  // This is needed because HTTP headers encode arrays as structured field lists (strings)
  // but HyperBEAM expects proper JSON arrays in the body
  for (const field of listFields) {
    if (body[field] && typeof body[field] === "string") {
      body[field] = parseStructuredFieldList(body[field])
    }
  }

  // Beta3 requires 'committed' array listing the signed keys in each commitment
  // Exclude list fields as they get converted to +links by HyperBEAM
  const committedKeys = components
    .map(v => (v === "@path" ? "path" : v))
    .filter(key => !listFields.has(key))

  // Beta3: Create single RSA commitment
  // The HMAC signature is server-side only (for "constant:ao" keyid)
  // Extract keyid from the public key (with publickey: prefix for beta3)
  // Note: HyperBEAM's apply_scheme uses base64:decode which expects standard base64
  const keyid = `publickey:${pub.toString("base64")}`

  const committed = {
    commitments: {
      [rsaId]: {
        type: "rsa-pss-sha512",
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
