import HB from "/home/user/wao/src/hb.js"
import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

async function main() {
  // Read the wallet
  const cwd = "/home/user/HyperBEAM"
  const walletPath = resolve(cwd, ".wallet.json")
  const jwk = JSON.parse(readFileSync(walletPath, "utf8"))
  
  // Create HB instance
  const hb = new HB({ url: "http://localhost:10001" })
  await hb.init(jwk)
  
  console.log("=== HB initialized ===")
  console.log("Address:", hb.addr)
  
  // Test signing spawn message
  const spawnTags = {
    "random-seed": "test-seed-123",
    type: "Process",
    "execution-device": "test-device@1.0",
    device: "process@1.0",
    scheduler: hb.addr,
  }
  
  console.log("\n=== Spawn tags ===")
  console.log(JSON.stringify(spawnTags, null, 2))
  
  // Sign the message
  try {
    const signed = await hb.sign({ path: "/~scheduler@1.0/schedule", ...spawnTags })
    console.log("\n=== Signed message ===")
    console.log("URL:", signed.url)
    console.log("Method:", signed.method)
    console.log("Headers:", JSON.stringify(signed.headers, null, 2))
    if (signed.body) {
      console.log("Body:", signed.body)
    }
  } catch (e) {
    console.error("Signing error:", e.message)
    console.error(e.stack)
  }
}

main().catch(console.error)
