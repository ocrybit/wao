import { httpsig_to } from "./hbsig/dist/esm/httpsig.js"
import { normalize } from "./hbsig/dist/esm/erl_json.js"
import { structured_from } from "./hbsig/dist/esm/structured.js"

// Simulate what schedule sends
const fields = {
  type: "Message",
  target: "KaDgJs6SAvVR9Qz-on6sLaerC2fTXx9G6vIg3deDXts",
  data: "abc",
  path: "/KaDgJs6SAvVR9Qz-on6sLaerC2fTXx9G6vIg3deDXts/schedule"
}

console.log("Input:", fields)
console.log("")

const normalized1 = normalize(fields)
console.log("After normalize:", normalized1)
console.log("")

const structured = structured_from(normalized1)
console.log("After structured_from:", structured)
console.log("")

const normalized2 = normalize(structured)
console.log("After second normalize:", normalized2)
console.log("")

const encoded = httpsig_to(normalized2)
console.log("After httpsig_to:", encoded)
console.log("")

if (encoded.body) {
  console.log("Body type:", typeof encoded.body)
  console.log("Body length:", encoded.body.length)
  console.log("Body value:", encoded.body)
  if (Buffer.isBuffer(encoded.body)) {
    console.log("Body bytes:", [...encoded.body])
  }
}
