import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

/**
 * Helper to spawn a process using direct JSON POST
 */
async function spawnProcess(hb, tags = {}) {
  const testTags = {
    type: "Process",
    device: "process@1.0",
    scheduler: hb.addr,
    "execution-device": "test-device@1.0",
    "random-seed": `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...tags,
  }

  const committed = await hb.commit(testTags, { path: false })

  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    throw new Error(`Spawn failed: ${response.status}`)
  }

  return {
    pid: response.headers.get("process"),
  }
}

describe("Hyperbeam Server", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => {
    hbeam.kill()
  })

  it("should start and respond to requests", async () => {
    const info = await hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond to meta info request")
    assert.equal(info.port, 10001, "Port should be 10001")
  })

  it("should be persistent across restarts", async () => {
    // Spawn a process
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")
    console.log("Spawned process:", pid)

    // Get scheduler status before restart
    const statusBefore = await hb.g("/~scheduler@1.0/status")
    assert.ok(statusBefore["processes+link"], "Should have processes before restart")

    // Kill and restart HyperBEAM without reset
    hbeam.kill()
    hbeam = await new HyperBEAM({ reset: false, timeout: 60 }).ready()
    hb = hbeam.hb

    // Get scheduler status after restart
    const statusAfter = await hb.g("/~scheduler@1.0/status")
    assert.ok(statusAfter["processes+link"], "Should have processes after restart")

    // Verify we can still access the process
    const processInfo = await hb.g(`/${pid}~process@1.0/info`)
    assert.ok(processInfo, "Process should still be accessible after restart")
  })
})
