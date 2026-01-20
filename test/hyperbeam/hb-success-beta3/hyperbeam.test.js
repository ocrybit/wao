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
    const text = await response.text()
    throw new Error(`Spawn failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    pid: response.headers.get("process"),
    slot: response.headers.get("slot"),
  }
}

/**
 * Helper to schedule a message to a process
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Schedule failed: ${response.status} - ${text.substring(0, 200)}`)
  }

  return {
    slot: response.headers.get("slot"),
  }
}

describe("Hyperbeam Integration", function () {
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

  // Note: Full legacy tests require genesis_wasm: true and legacy API methods
  // These tests verify basic HyperBEAM functionality with beta3 compatible approach

  it("should get server info", async () => {
    const info = await hb.g("/~meta@1.0/info")
    assert.ok(info, "Server should respond")
    assert.equal(info.port, 10001, "Port should be 10001")
    assert.equal(info.address, hb.addr, "Address should match")
  })

  it("should get meta build info", async () => {
    const build = await hb.g("/~meta@1.0/build")
    assert.ok(build, "Build info should be returned")
    assert.equal(build.node, "HyperBEAM", "Node should be HyperBEAM")
  })

  it("should spawn and schedule to a process", async () => {
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")

    const { slot } = await scheduleMessage(hb, pid, { action: "Test" })
    assert.ok(slot, "Message should be scheduled")

    // Compute results
    const results = await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })
    assert.ok(results, "Results should be returned")
  })

  it("should get process info", async () => {
    const { pid } = await spawnProcess(hb)
    assert.ok(pid, "Process should be spawned")

    const info = await hb.g(`/${pid}~process@1.0/info`)
    assert.ok(info, "Process info should be returned")
  })

  it("should get scheduler status", async () => {
    const status = await hb.g("/~scheduler@1.0/status")
    assert.ok(status, "Scheduler status should be returned")
    assert.ok(status["processes+link"], "Should have processes link")
  })

  it("should use json device", async () => {
    const obj = { key: 1, key2: "value" }
    const res = await hb.p("/~json@1.0/serialize", { ...obj })
    assert.ok(res.body, "JSON serialize should return body")
  })

  it("should use message device", async () => {
    const res = await hb.g("/~message@1.0/set/test", { key: "value" })
    assert.ok(res !== undefined, "Message device should respond")
  })
})
