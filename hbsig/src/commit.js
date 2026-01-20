import { id, base, hashpath, rsaid, hmacid } from "./id.js"
import { toAddr } from "./utils.js"
import { extractPubKey } from "./signer-utils.js"
import { verify } from "./signer-utils.js"

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

// todo: handle @
export const commit = async (obj, opts) => {
  const msg = await opts.signer(obj, opts)
  const {
    decodedSignatureInput: { components },
  } = await verify(msg)

  let body = {}

  // Check for inline-body-key
  const inlineBodyKey = msg.headers["inline-body-key"]

  // Build body from components
  for (const v of components) {
    const key = v === "@path" ? "path" : v
    body[key] = msg.headers[key]
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

  // Beta3 requires 'committed' array listing the signed keys in each commitment
  const committedKeys = components.map(v => (v === "@path" ? "path" : v))

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
