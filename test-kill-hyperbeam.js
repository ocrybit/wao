import { spawn, spawnSync } from "child_process"
import { resolve } from "path"

const HB_DIR = resolve(process.env.HOME, "HyperBEAM-beta1")
const PORT = 10099

// Helper to run commands safely
const run = (cmd) => {
  const result = spawnSync("bash", ["-c", cmd], { encoding: "utf8" })
  return result.stdout?.trim() || ""
}

console.log("=== HyperBEAM Kill Test ===")

// Cleanup any existing processes first
console.log("[0] Pre-cleanup...")
run("pkill -9 -f 'beam.smp' || true")
run("pkill -9 -f 'epmd' || true")

// Start HyperBEAM with detached process group
console.log("[1] Starting HyperBEAM...")
const hb = spawn(
  "bash",
  [
    "-c",
    `. ~/.asdf/asdf.sh && exec rebar3 shell --eval 'hb:start_mainnet(#{port => ${PORT}, priv_key_location => <<".wallet.json">>}).'`
  ],
  {
    cwd: HB_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  }
)

// CRITICAL: Unref to allow Node to exit even if child is running
hb.unref()

const pid = hb.pid
console.log(`[1] PID: ${pid}, Process Group: -${pid}`)

// Don't attach to stdout/stderr - just let it run
hb.stdout.unref()
hb.stderr.unref()

// Wait for ready
console.log("[2] Waiting for ready (max 15s)...")
let ready = false
for (let i = 0; i < 15; i++) {
  try {
    const res = await fetch(`http://localhost:${PORT}/~meta@1.0/info/address`)
    if (res.ok) {
      ready = true
      console.log(`[2] Ready after ${i+1}s`)
      break
    }
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1000))
  process.stdout.write(".")
}

if (!ready) {
  console.log("\n[2] Not ready, continuing to test kill...")
}

// Check what's running
console.log("[3] Checking processes before kill...")
const beforeBeam = run("pgrep -a beam.smp || echo 'none'")
const beforeEpmd = run("pgrep -a epmd || echo 'none'")
console.log(`    beam.smp: ${beforeBeam}`)
console.log(`    epmd: ${beforeEpmd}`)

// Test the kill - process group first
console.log("[4] Killing process group...")
try {
  process.kill(-pid, "SIGKILL")
  console.log("[4] Sent SIGKILL to process group -" + pid)
} catch (e) {
  console.log(`[4] Error: ${e.message}`)
}

await new Promise(r => setTimeout(r, 1000))

// Backup cleanup with pkill
console.log("[5] Backup pkill cleanup...")
run("pkill -9 -f 'beam.smp' || true")
run("pkill -9 -f 'epmd' || true")

await new Promise(r => setTimeout(r, 1000))

// Verify
console.log("[6] Checking processes after kill...")
const afterBeam = run("pgrep -a beam.smp || echo 'none'")
const afterEpmd = run("pgrep -a epmd || echo 'none'")
console.log(`    beam.smp: ${afterBeam}`)
console.log(`    epmd: ${afterEpmd}`)

if (afterBeam === "none") {
  console.log("\n[SUCCESS] All beam.smp processes killed!")
} else {
  console.log("\n[FAIL] Some processes still running!")
}

console.log("=== Done ===")
