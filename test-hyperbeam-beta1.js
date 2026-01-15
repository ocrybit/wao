import { spawn } from "child_process"
import { resolve } from "path"

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

    this._shell = spawn(
      "rebar3",
      ["shell", "--eval", this.genEval()],
      {
        env: { ...process.env },
        cwd: this.cwd,
      }
    )

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
    if (this._shell) {
      console.log("Stopping HyperBEAM...")
      this._shell.kill("SIGKILL")
      this._shell = null
      console.log("HyperBEAM stopped")
      return true
    }
    return false
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
