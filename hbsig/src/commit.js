import { id, base, hashpath, rsaid, hmacid } from "./id.js"
import { toAddr } from "./utils.js"
import { extractPubKey } from "./signer-utils.js"
import { verify } from "./signer-utils.js"

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
  const pubKeyBase64 = pub.toString("base64")
  const committer = toAddr(pubKeyBase64)
  const keyid = `publickey:${pubKeyBase64}`
  // Build the list of committed fields (same as components, normalized to match what Erlang expects)
  const committedFields = components.map(v => v === "@path" ? "path" : v)
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
  const meta2 = {
    type: "hmac-sha256",
    alg: "hmac-sha256",
    "commitment-device": "httpsig@1.0",
    committed: committedFields
  }
  const sigs = {
    signature: rawSignature,
    "signature-input": msg.headers["signature-input"],
  }
  const committed = {
    commitments: {
      [rsaId]: { ...meta, committer, ...sigs },
      [hmacId]: { ...meta2, ...sigs },
    },
    ...body,
  }
  return committed
}
