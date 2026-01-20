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

describe("HyperBEAM Process (Beta3)", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => {
    hbeam.kill()
  })

  it("should spawn and schedule messages to a process", async () => {
    // Spawn a process
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")
    console.log("Spawned process:", pid)

    // Schedule multiple messages
    await scheduleMessage(hb, pid, { action: "Test1" })
    await scheduleMessage(hb, pid, { action: "Test2" })
    const { slot } = await scheduleMessage(hb, pid, { action: "Test3" })

    assert.ok(slot, "Should get slot number")
    console.log("Last message scheduled at slot:", slot)

    // Compute results at a specific slot
    const results = await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })
    assert.ok(results, "Results should be returned")
    console.log("Compute results type:", results.type)
  })

  it("should compute process state at different slots", async () => {
    // Spawn a process
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")

    // Schedule messages at slots 1 and 2
    await scheduleMessage(hb, pid, { action: "First" })
    await scheduleMessage(hb, pid, { action: "Second" })

    // Compute at slot 2 (includes both messages)
    const results = await hb.g(`/${pid}~process@1.0/compute`, { slot: 2 })
    assert.ok(results, "Results should be returned")
    assert.equal(results["at-slot"], "2", "Should be at slot 2")
    console.log("Computed at slot 2, results type:", results.type)
  })

  it("should get process info", async () => {
    // Spawn a process
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")

    // Get process info
    const info = await hb.g(`/${pid}~process@1.0/info`)
    assert.ok(info, "Process info should be returned")
    console.log("Process info keys:", Object.keys(info))
  })

  it("should get process slot assignments", async () => {
    // Spawn a process
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")

    // Schedule some messages
    await scheduleMessage(hb, pid, { action: "Msg1" })
    await scheduleMessage(hb, pid, { action: "Msg2" })

    // Get slot info
    const slotInfo = await hb.g(`/${pid}~process@1.0/slot`)
    assert.ok(slotInfo, "Slot info should be returned")
    console.log("Slot info:", slotInfo)
  })
})

