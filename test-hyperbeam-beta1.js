import { spawn, execSync } from "child_process"

const CWD = process.env.HYPERBEAM_DIR || `${process.env.HOME}/HyperBEAM-beta1`
const PORT = process.env.PORT || 10001
const TIMEOUT = parseInt(process.env.TIMEOUT) || 30000

class HyperBEAMTest {
  constructor({ port = PORT, cwd = CWD, logs = true } = {}) {
    this.port = port
    this.cwd = cwd
    this.url = `http://localhost:${this.port}`
    this.logs = logs
    this._shell = null
  }

  genEval() {
    return `hb:start_mainnet(#{ port => ${this.port}, priv_key_location => <<".wallet.json">> }).`
  }

  start() {
    console.log(`Starting HyperBEAM on port ${this.port}...`)
    console.log(`Working directory: ${this.cwd}`)

    // Use bash to source asdf and run rebar3
    const cmd = `. ~/.asdf/asdf.sh && rebar3 shell --eval '${this.genEval()}'`

    this._shell = spawn("bash", ["-c", cmd], {
      env: { ...process.env },
      cwd: this.cwd,
      detached: true,  // Create new process group
    })

    this._pid = this._shell.pid
    console.log(`Spawned process PID: ${this._pid}`)

    if (this.logs) {
      this._shell.stdout.on("data", chunk => {
        const text = chunk.toString()
        if (text.trim()) console.log("[HB]", text.trim())
      })
      this._shell.stderr.on("data", err => {
        const text = err.toString()
        if (text.trim()) console.error("[HB-ERR]", text.trim())
      })
      this._shell.on("error", err => {
        console.error(`Failed to start process: ${err}`)
      })
      this._shell.on("close", code => {
        console.log(`HyperBEAM process exited with code ${code}`)
        this._shell = null
      })
    }

    return this
  }

  async ok() {
    try {
      const response = await fetch(`${this.url}/~meta@1.0/info/address`)
      const address = await response.text()
      return !!address
    } catch (e) {
      return false
    }
  }

  async ready(timeout = TIMEOUT) {
    const start = Date.now()
    console.log(`Waiting for HyperBEAM to be ready (timeout: ${timeout}ms)...`)

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        const elapsed = Date.now() - start

        if (elapsed > timeout) {
          clearInterval(interval)
          console.log("Timeout waiting for HyperBEAM")
          resolve(false)
          return
        }

        if (await this.ok()) {
          clearInterval(interval)
          console.log(`HyperBEAM ready after ${elapsed}ms`)
          resolve(true)
        }
      }, 1000)
    })
  }

  async getInfo() {
    try {
      const address = await fetch(`${this.url}/~meta@1.0/info/address`).then(r => r.text())
      const version = await fetch(`${this.url}/~meta@1.0/info/version`).then(r => r.text()).catch(() => "unknown")
      return { address, version }
    } catch (e) {
      return null
    }
  }

  stop() {
    console.log("Stopping HyperBEAM...")

    // Kill the process group (including all children like beam.smp)
    if (this._shell && this._pid) {
      try {
        process.kill(-this._pid, "SIGKILL")  // Negative PID kills process group
      } catch (e) {
        // Process may already be gone
      }
    }

    // Also kill any remaining beam.smp and epmd processes
    try {
      execSync("pkill -9 -f 'beam.smp' 2>/dev/null || true", { stdio: "ignore" })
      execSync("pkill -9 -f 'epmd' 2>/dev/null || true", { stdio: "ignore" })
    } catch (e) {
      // Ignore errors
    }

    this._shell = null
    console.log("HyperBEAM stopped")
    return true
  }
}

async function main() {
  console.log("=== HyperBEAM Beta-1 Start/Stop Test ===\n")

  const startTime = Date.now()
  const hb = new HyperBEAMTest()

  // Start HyperBEAM
  hb.start()

  // Wait for it to be ready
  const isReady = await hb.ready()

  if (!isReady) {
    console.error("\nFailed: HyperBEAM did not become ready in time")
    hb.stop()
    process.exit(1)
  }

  // Get info to verify it's working
  const info = await hb.getInfo()
  console.log("\nHyperBEAM Info:")
  console.log(`  Address: ${info?.address || "unknown"}`)
  console.log(`  Version: ${info?.version || "unknown"}`)

  // Stop HyperBEAM
  const readyTime = Date.now()
  console.log("")
  hb.stop()

  // Wait a moment to ensure clean shutdown
  await new Promise(r => setTimeout(r, 1000))

  const endTime = Date.now()

  console.log("\n=== Test Results ===")
  console.log(`  Startup time: ${readyTime - startTime}ms`)
  console.log(`  Total time: ${endTime - startTime}ms`)
  console.log(`  Status: PASSED`)

  process.exit(0)
}

main().catch(err => {
  console.error("Test failed:", err)
  process.exit(1)
})
