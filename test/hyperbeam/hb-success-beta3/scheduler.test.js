import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

/**
 * Helper to spawn a process using direct JSON POST
 * This is the beta3-compatible way to submit committed messages
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
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spawn failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    pid: response.headers.get("process"),
    slot: response.headers.get("slot"),
    status: response.status,
  }
}

/**
 * Helper to schedule a message to a process using direct JSON POST
 */
async function scheduleMessage(hb, pid, tags = {}) {
  const testTags = {
    type: "Message",
    target: pid,
    ...tags,
  }

  const committed = await hb.commit(testTags, { path: false })

  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Schedule failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    slot: response.headers.get("slot"),
    status: response.status,
  }
}

describe("HyperBEAM Scheduler (Beta3)", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 90 }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => {
    hbeam.kill()
  })

  it("should spawn a process", async () => {
    const { pid, slot, status } = await spawnProcess(hb)

    assert.ok(pid, "Process ID should be returned")
    assert.equal(slot, "0", "First slot should be 0")
    assert.equal(status, 200, "Status should be 200")

    console.log("Spawned process:", pid)
  })

  it("should get scheduler status", async () => {
    const status = await hb.g("/~scheduler@1.0/status")

    assert.ok(status, "Status should be returned")
    assert.ok(status["processes+link"], "Should have processes link")
  })

  it("should schedule a message to a process", async () => {
    // First spawn a process
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")

    // Schedule a message
    const { slot, status } = await scheduleMessage(hb, pid, {
      action: "Test",
    })

    assert.equal(status, 200, "Status should be 200")
    assert.ok(slot, "Slot should be returned")

    console.log("Scheduled message to process", pid, "at slot", slot)
  })

  it("should compute results for a scheduled message", async () => {
    // Spawn a process
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")

    // Schedule a message
    const { slot } = await scheduleMessage(hb, pid, {
      action: "Test",
    })
    assert.ok(slot, "Slot should be returned")

    // Compute results
    const results = await hb.g(`/${pid}~process@1.0/compute`, { slot })

    assert.ok(results, "Results should be returned")
    console.log("Compute results keys:", Object.keys(results))
  })
})
