import base64url from "base64url"
import { httpbis } from "./http-message-signatures/index.js"
import { parseItem, serializeList } from "structured-headers"
import { httpsig_from } from "./httpsig.js"
import { structured_to } from "./structured.js"
import { result } from "./send-utils.js"

const {
  augmentHeaders,
  createSignatureBase,
  createSigningParameters,
  formatSignatureBase,
} = httpbis

const toMsg = async req => {
  let msg = {}
  req?.headers?.forEach((v, k) => {
    msg[k] = v
  })
  if (req.body) {
    const arrayBuffer = await req.arrayBuffer()
    msg.body =
      typeof Buffer !== "undefined"
        ? Buffer.from(arrayBuffer) // Node.js
        : new Uint8Array(arrayBuffer) // Browser
  }

  return msg
}

export async function send(signedMsg, fetchImpl = fetch) {
  const fetchOptions = {
    method: signedMsg.method,
    headers: signedMsg.headers,
    redirect: "follow",
  }
  if (
    signedMsg.body !== undefined &&
    signedMsg.method !== "GET" &&
    signedMsg.method !== "HEAD"
  ) {
    fetchOptions.body = signedMsg.body
  }
  // Debug: log what we're actually sending
  const bodySize = fetchOptions.body?.size || fetchOptions.body?.length || fetchOptions.body?.byteLength || 0
  console.log("[SEND DEBUG] url:", signedMsg.url, "body size:", bodySize)
  console.log("[SEND DEBUG] headers:", JSON.stringify(signedMsg.headers, null, 2).substring(0, 2500))
  const response = await fetchImpl(signedMsg.url, fetchOptions)
  console.log("[SEND DEBUG] response status:", response.status, "url:", signedMsg.url)
  if (response.status >= 400) {
    const errorText = await response.text()
    console.log("[SEND DEBUG] error response:", errorText.substring(0, 200))
    throw new Error(`${response.status}: ${errorText}`)
  }
  return await result(response)
}

export const httpSigName = address => {
  const decoded = base64url.toBuffer(address)
  const hexString = [...decoded.subarray(1, 9)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
  // Use 'comm-' prefix to match HyperBEAM's expected pattern in siginfo_to_commitments
  // HyperBEAM expects signature headers to start with 'comm-' (see dev_codec_httpsig_siginfo.erl)
  return `comm-${hexString}`
}

const toView = value => {
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  } else if (typeof value === "string") return base64url.toBuffer(value)

  throw new Error(
    "Value must be Uint8Array, ArrayBuffer, or base64url-encoded string"
  )
}

export const toHttpSigner = signer => {
  const params = ["alg", "keyid"].sort()
  return async ({ request, fields }) => {
    let signatureBase
    let signatureInput
    let createCalled = false

    const create = injected => {
      createCalled = true

      const { publicKey, alg = "rsa-pss-sha512" } = injected

      const publicKeyBuffer = toView(publicKey)
      // Use standard base64 encoding for keyid to be compatible with HyperBEAM's
      // base64:decode in dev_codec_httpsig_keyid:apply_scheme
      // Include "publickey:" prefix so HyperBEAM knows the key scheme
      const keyidBase64 = `publickey:${publicKeyBuffer.toString("base64")}`

      const signingParameters = createSigningParameters({
        params,
        paramValues: {
          keyid: keyidBase64,
          alg,
        },
      })

      // SORT THE FIELDS HERE to match Erlang's lists:sort(maps:keys(Enc))
      const sortedFields = [...fields].sort()

      const signatureBaseArray = createSignatureBase(
        { fields: sortedFields },
        request
      )
      signatureInput = serializeList([
        [
          signatureBaseArray.map(([item]) => parseItem(item)),
          signingParameters,
        ],
      ])

      signatureBaseArray.push(['"@signature-params"', [signatureInput]])
      signatureBase = formatSignatureBase(signatureBaseArray)
      return new TextEncoder().encode(signatureBase)
    }
    const result = await signer(create, "httpsig")
    if (!createCalled) {
      throw new Error(
        "create() must be invoked in order to construct the data to sign"
      )
    }

    if (!result.signature || !result.address) {
      throw new Error("Signer must return signature and address")
    }

    const signatureBuffer = toView(result.signature)
    const signedHeaders = augmentHeaders(
      request.headers,
      signatureBuffer,
      signatureInput,
      httpSigName(result.address)
    )
    const finalHeaders = {}
    for (const [key, value] of Object.entries(signedHeaders)) {
      if (key === "Signature" || key === "Signature-Input") {
        finalHeaders[key.toLowerCase()] = value
      } else finalHeaders[key] = value
    }

    return { ...request, headers: finalHeaders }
  }
}
