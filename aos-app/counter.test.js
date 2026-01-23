/**
 * Counter AOS App Tests
 *
 * Tests the counter Lua script using WAO SDK's in-memory AO execution.
 * No HyperBEAM required - runs entirely in-memory.
 *
 * Run with:
 * HB_TIMEOUT=60 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/counter.test.js
 */

import assert from "assert"
import { describe, it, before } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { AO, connect, acc, scheduler } from "../src/test.js"
import ArMem from "../src/armem.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load the counter Lua script
const counterScript = readFileSync(resolve(__dirname, "counter.lua"), "utf8")

// Use pre-configured test accounts
const [{ signer, jwk }] = acc

describe("Counter App (In-Memory)", function() {
  let mem, ao, pid

  before(async () => {
    // Create in-memory AO environment
    mem = new ArMem()
    const { spawn, message, dryrun } = connect(mem)

    // Spawn a process with the AOS module
    pid = await spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })

    // Load the counter script
    await message({
      process: pid,
      signer,
      tags: [{ name: "Action", value: "Eval" }],
      data: counterScript,
    })

    // Store references for tests
    ao = { mem, spawn, message, dryrun, pid }

    console.log("Process spawned:", pid)
  })

  it("should get initial count of 0", async () => {
    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    const output = result.Messages?.[0]
    assert.ok(output, "Should have output message")
    assert.equal(output.Data, "0", "Initial count should be 0")
  })

  it("should increment count", async () => {
    // Send increment message
    await ao.message({
      process: ao.pid,
      signer,
      tags: [{ name: "Action", value: "Inc" }],
      data: "",
    })

    // Check the count
    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    const output = result.Messages?.[0]
    assert.ok(output, "Should have output message")
    assert.equal(output.Data, "1", "Count should be 1 after increment")
  })

  it("should increment count multiple times", async () => {
    // Increment twice more
    await ao.message({
      process: ao.pid,
      signer,
      tags: [{ name: "Action", value: "Inc" }],
      data: "",
    })
    await ao.message({
      process: ao.pid,
      signer,
      tags: [{ name: "Action", value: "Inc" }],
      data: "",
    })

    // Check the count
    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    const output = result.Messages?.[0]
    assert.ok(output, "Should have output message")
    assert.equal(output.Data, "3", "Count should be 3 after 3 increments")
  })

  it("should decrement count", async () => {
    await ao.message({
      process: ao.pid,
      signer,
      tags: [{ name: "Action", value: "Dec" }],
      data: "",
    })

    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    const output = result.Messages?.[0]
    assert.ok(output, "Should have output message")
    assert.equal(output.Data, "2", "Count should be 2 after decrement")
  })

  it("should add custom amount", async () => {
    await ao.message({
      process: ao.pid,
      signer,
      tags: [
        { name: "Action", value: "Add" },
        { name: "Amount", value: "10" },
      ],
      data: "",
    })

    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    const output = result.Messages?.[0]
    assert.ok(output, "Should have output message")
    assert.equal(output.Data, "12", "Count should be 12 after adding 10")
  })

  it("should reset count", async () => {
    await ao.message({
      process: ao.pid,
      signer,
      tags: [{ name: "Action", value: "Reset" }],
      data: "",
    })

    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    const output = result.Messages?.[0]
    assert.ok(output, "Should have output message")
    assert.equal(output.Data, "0", "Count should be 0 after reset")
  })

  it("should return app info", async () => {
    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Info" }],
      data: "",
    })

    const output = result.Messages?.[0]
    assert.ok(output, "Should have output message")
    assert.equal(output.Data, "Counter App v1.0", "Should return app info")

    // Check tags
    const tags = output.Tags || []
    const nameTag = tags.find(t => t.name === "Name")
    const versionTag = tags.find(t => t.name === "Version")

    assert.ok(nameTag, "Should have Name tag")
    assert.equal(nameTag.value, "Counter", "Name should be Counter")
    assert.ok(versionTag, "Should have Version tag")
    assert.equal(versionTag.value, "1.0", "Version should be 1.0")
  })
})
