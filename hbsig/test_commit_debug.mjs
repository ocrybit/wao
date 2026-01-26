import { commit, createSigner } from "./src/index.js"
import { writeFileSync, readFileSync } from "fs"
import { resolve } from "path"
import crypto from "crypto"

async function main() {
  // Read the wallet
  const cwd = "/home/user/HyperBEAM"
  const walletPath = resolve(cwd, ".wallet.json")
  const jwk = JSON.parse(readFileSync(walletPath, "utf8"))
  
  // Create signer
  const url = "http://localhost:10001"
  const sign = createSigner(jwk, url)
  
  // Generate random seed
  const randomSeed = crypto.randomBytes(16).toString("base64")
  
  // Create spawn message (same as hb.spawn)
  const spawnTags = {
    "random-seed": randomSeed,
    type: "Process",
    "execution-device": "test-device@1.0",
    device: "process@1.0",
    scheduler: "ZEFZpHK4-4wG_vQSdf80YnCb2Jpay8YGDXHfXniEknM",
  }
  
  console.log("=== Input tags ===")
  console.log(JSON.stringify(spawnTags, null, 2))
  
  // Create committed message
  const committed = await commit(spawnTags, { signer: sign, path: false })
  
  console.log("\n=== Committed message ===")
  console.log(JSON.stringify(committed, null, 2))
  
  // Write to file for inspection
  writeFileSync("/tmp/committed_spawn.json", JSON.stringify(committed, null, 2))
  console.log("\n=== Written to /tmp/committed_spawn.json ===")
  
  // Show commitment details
  const commitmentId = Object.keys(committed.commitments)[0]
  const commitment = committed.commitments[commitmentId]
  console.log("\n=== Commitment details ===")
  console.log("ID:", commitmentId)
  console.log("Fields present:", Object.keys(commitment))
  console.log("Type:", commitment.type)
  console.log("Alg:", commitment.alg)
  console.log("Committed array:", commitment.committed)
  console.log("Committer:", commitment.committer)
  console.log("Keyid length:", commitment.keyid?.length || 0)
  console.log("Signature length:", commitment.signature?.length || 0)
  console.log("Signature-input present:", !!commitment["signature-input"])
}

main().catch(console.error)
