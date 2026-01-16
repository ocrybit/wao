import { execSync, spawnSync } from "child_process"
import { resolve } from "path"

const HB_DIR = resolve(process.env.HOME, "HyperBEAM-beta1")
const PORT = 10099

const run = (cmd, cwd) => {
  const result = spawnSync("bash", ["-c", `. ~/.asdf/asdf.sh && ${cmd}`], {
    encoding: "utf8",
    cwd: cwd || process.cwd()
  })
  return result.stdout?.trim() || ""
}

console.log("=== HyperBEAM Detached Test ===\n")

// 1. Pre-cleanup
console.log("[1] Pre-cleanup...")
run("pkill -9 -f beam.smp || true")
run("pkill -9 -f epmd || true")
console.log("    Done\n")

// 2. Start HyperBEAM detached
console.log("[2] Starting HyperBEAM with erl -detached...")
const startCmd = `erl -pa _build/default/lib/*/ebin -detached -eval "hb:start_mainnet(#{port => ${PORT}, priv_key_location => <<\\".wallet.json\\">>})."`
run(startCmd, HB_DIR)
console.log("    Command returned immediately\n")

// 3. Wait and check process
console.log("[3] Checking beam.smp process...")
await new Promise(r => setTimeout(r, 2000))
const proc = run("pgrep -a beam.smp || echo 'not found'")
console.log(`    ${proc.includes("beam.smp") ? "Running!" : "NOT running"}\n`)

// 4. Wait for HTTP ready
console.log("[4] Waiting for HTTP ready...")
let ready = false
for (let i = 0; i < 10; i++) {
  try {
    const res = await fetch(`http://localhost:${PORT}/~meta@1.0/info/address`)
    if (res.ok) {
      const addr = await res.text()
      console.log(`    Ready! Address: ${addr.slice(0, 20)}...\n`)
      ready = true
      break
    }
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1000))
  process.stdout.write(".")
}
if (!ready) console.log("\n    Not ready after 10s\n")

// 5. Kill HyperBEAM
console.log("[5] Killing HyperBEAM...")
spawnSync("pkill", ["-9", "-f", "beam.smp"])
spawnSync("pkill", ["-9", "-f", "epmd"])
await new Promise(r => setTimeout(r, 2000))

// 6. Verify killed
const afterProc = spawnSync("pgrep", ["beam.smp"], { encoding: "utf8" }).stdout?.trim()
console.log(`    ${afterProc === "" ? "Killed successfully!" : "Still running: " + afterProc}\n`)

console.log("=== Test Complete ===")
