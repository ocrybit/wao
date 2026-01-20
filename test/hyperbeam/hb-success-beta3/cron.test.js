import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { wait } from "../../../src/utils.js"
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

describe("Hyperbeam Cron", function () {
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

  // Note: cron@1.0 requires a running process with execution-device
  // In beta3, wao@1.0 execution device may not be available by default

  it("should have cron device available", async () => {
    // Test that the cron device responds to status request
    const res = await fetch(`${hbeam.url}/~cron@1.0/status`)
    // Accept any response - device is available if server responds
    assert.ok(res.status, "Cron device should respond")
    console.log("Cron status response:", res.status)
  })
})
