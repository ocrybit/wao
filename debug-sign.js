import { createSigner } from "./hbsig/dist/esm/signer.js"
import { readFileSync } from "fs"

// Load wallet
const jwk = JSON.parse(readFileSync("../HyperBEAM/.wallet.json", "utf8"))
const url = "http://localhost:10001"

const sign = createSigner(jwk, url)

// Simulate what schedule sends
const fields = {
  type: "Message",
  target: "KaDgJs6SAvVR9Qz-on6sLaerC2fTXx9G6vIg3deDXts",
  data: "abc",
  path: "/KaDgJs6SAvVR9Qz-on6sLaerC2fTXx9G6vIg3deDXts/schedule"
}

console.log("Input fields:", fields)
console.log("")

const signed = await sign(fields, { path: false })

console.log("Signed message:")
console.log("URL:", signed.url)
console.log("Method:", signed.method)
console.log("Headers:", signed.headers)
console.log("")

if (signed.body) {
  console.log("Body type:", typeof signed.body)
  console.log("Body constructor:", signed.body?.constructor?.name)

  if (typeof signed.body === "string") {
    console.log("Body length:", signed.body.length)
    console.log("Body value:", signed.body)
  } else if (signed.body instanceof Blob) {
    console.log("Body size:", signed.body.size)
    const text = await signed.body.text()
    console.log("Body text:", text)
  } else if (Buffer.isBuffer(signed.body)) {
    console.log("Body length:", signed.body.length)
    console.log("Body value:", signed.body.toString())
  } else {
    console.log("Body:", signed.body)
  }
}
