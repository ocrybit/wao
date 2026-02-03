import { id, base, hashpath, rsaid } from "./id.js"
import { toAddr } from "./utils.js"
import { extractPubKey } from "./signer-utils.js"
import { verify } from "./signer-utils.js"
import crypto from "crypto"

// Helper to compute SHA-256 content-digest in RFC 9530 format
const computeContentDigest = (body) => {
  let bodyBuffer
  if (Buffer.isBuffer(body)) {
    bodyBuffer = body
  } else if (body instanceof Blob) {
    return null // Can't compute synchronously for Blob
  } else if (typeof body === "string") {
    bodyBuffer = Buffer.from(body, "binary")
  } else {
    bodyBuffer = Buffer.from(String(body), "binary")
  }
  const hash = crypto.createHash("sha256").update(bodyBuffer).digest("base64")
  return `sha-256=:${hash}:`
}

// Helper to build ao-types string from an object
// Arrays ARE included in ao-types - HyperBEAM needs this to parse RFC 8941 structured field strings
// The string format "item1", "item2" will be parsed into an Erlang list
const buildAoTypes = (obj) => {
  const types = []
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number") {
      types.push(`${key}="${Number.isInteger(value) ? "integer" : "float"}"`)
    } else if (typeof value === "boolean") {
      types.push(`${key}="atom"`)
    } else if (value === null) {
      types.push(`${key}="atom"`)
    } else if (Array.isArray(value) && value.length > 0) {
      // Add ao-types for arrays so HyperBEAM parses them as lists
      // The structured field string format will be parsed into an Erlang list
      types.push(`${key}="list"`)
    }
  }
  return types.length > 0 ? types.join(", ") : null
}

// todo: handle @
export const commit = async (obj, opts) => {
  const msg = await opts.signer(obj, opts)
  const {
    decodedSignatureInput: { components },
  } = await verify(msg)

  let body = {}

  // Check for inline-body-key
  const inlineBodyKey = msg.headers["inline-body-key"] || msg.headers["ao-body-key"]

  // Build body from components - copy from headers AS-IS (don't decode)
  // The values must match what was signed for signature verification to work
  // HyperBEAM's structured codec will decode :base64: format based on ao-types
  for (const v of components) {
    const key = v === "@path" ? "path" : v
    if (msg.headers[key] !== undefined) {
      body[key] = msg.headers[key]
    }
  }

  // Handle body resolution
  let bodyContent = null
  if (msg.body) {
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

  // Always include ao-types from headers (for type conversion in JSON codec)
  // This is NOT signed (excluded from signing) but still needed in the body
  if (!body["ao-types"] && msg.headers["ao-types"]) {
    body["ao-types"] = msg.headers["ao-types"]
  } else if (!body["ao-types"]) {
    // Build ao-types from the original object if not in headers
    const aoTypes = buildAoTypes(obj)
    if (aoTypes) {
      body["ao-types"] = aoTypes
    }
  }

  // Note: We don't add ao-body-key here - it's not supported by HyperBEAM's JSON codec
  // Keep inline-body-key in the body if it was committed (signed) - HyperBEAM validates all committed fields

  const rsaId = rsaid(msg.headers)
  const pub = extractPubKey(msg.headers)
  const pubKeyBase64 = pub.toString("base64")
  const committer = toAddr(pubKeyBase64)

  // Extract keyid from signature-input to ensure it matches what was signed
  // Format: sig-xxx=("field1"...);alg="...";keyid="..."
  // The keyid may already have a scheme prefix (e.g., "publickey:base64data")
  const extractKeyidFromSigInput = (sigInput) => {
    if (!sigInput) return null
    const match = sigInput.match(/keyid="([^"]+)"/)
    if (!match) return null
    // Return as-is - the keyid already includes the prefix from signing
    return match[1]
  }
  const keyid = extractKeyidFromSigInput(msg.headers["signature-input"]) || `publickey:${pubKeyBase64}`

  // Build the list of committed fields (same as components, normalized to match what Erlang expects)
  let committedFields = components.map(v => v === "@path" ? "path" : v)

  // If content-digest was signed and ao-body-key is set, the body field is committed through content-digest
  // We need to add it to the committed list so HyperBEAM's with_only_committed doesn't strip it
  if (components.includes("content-digest") && inlineBodyKey && inlineBodyKey !== "body") {
    // Add the body key (e.g., "data") to committed fields if not already there
    if (!committedFields.includes(inlineBodyKey)) {
      committedFields.push(inlineBodyKey)
    }
  }

  // If body-keys is set (multipart encoding), add those fields to committed list
  // The body-keys fields are in the multipart body, covered by content-digest
  const bodyKeysHeader = msg.headers["body-keys"]
  if (bodyKeysHeader && components.includes("content-digest")) {
    // Parse body-keys: "device-stack", "other-field" -> ["device-stack", "other-field"]
    const bodyKeysList = bodyKeysHeader
      .replace(/"/g, "")
      .split(",")
      .map(k => k.trim())
      .filter(k => k.length > 0)

    for (const key of bodyKeysList) {
      if (!committedFields.includes(key)) {
        committedFields.push(key)
      }
    }
  }

  // Extract just the base64 signature data from the header format "sig-xxx=:base64data:"
  // HyperBEAM expects raw base64 without colons (uses b64fast:encode/decode)
  const extractSignature = (sigHeader) => {
    if (!sigHeader) return sigHeader
    // Match the base64 data between colons after the label
    const match = sigHeader.match(/=:([^:]+):/)
    return match ? match[1] : sigHeader
  }
  const rawSignature = extractSignature(msg.headers.signature)
  const meta = {
    type: "rsa-pss-sha512",
    alg: "rsa-pss-sha512",
    "commitment-device": "httpsig@1.0",
    keyid: keyid,
    committed: committedFields
  }
  const sigs = {
    signature: rawSignature,
    "signature-input": msg.headers["signature-input"],
  }
  // Only include the RSA commitment - HMAC commitments are created by HyperBEAM
  // when needed and require the server's HMAC key which we don't have
  const committed = {
    commitments: {
      [rsaId]: { ...meta, committer, ...sigs },
    },
    ...body,
  }

  return committed
}
