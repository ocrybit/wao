/**
 * Example Usage Tests
 *
 * This file demonstrates how to use the vibe-coded examples with the WAO SDK.
 * These tests use the in-memory ArMem for fast execution.
 */

import { describe, it, beforeAll, expect } from "vitest"
import { connect, acc, wait } from "../../src/test.js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load Lua source files
const loadLua = (name) => {
  return readFileSync(join(__dirname, "..", "apps", `${name}.lua`), "utf-8")
}

describe("Counter App", () => {
  let pid
  let message, dryrun

  beforeAll(async () => {
    const { spawn, message: msg, dryrun: dry } = connect()
    message = msg
    dryrun = dry
    const { signer } = acc[0]

    // Spawn process
    pid = await spawn({ signer })

    // Load counter code
    const src = loadLua("counter")
    await message({ pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should start at 0", async () => {
    const { signer } = acc[0]
    const res = await dryrun({ pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = JSON.parse(res.Output.data)
    expect(data.count).toBe(0)
  })

  it("should increment", async () => {
    const { signer } = acc[0]
    await message({ pid, signer, tags: [{ name: "Action", value: "Inc" }] })
    const res = await dryrun({ pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = JSON.parse(res.Output.data)
    expect(data.count).toBe(1)
  })

  it("should increment by amount", async () => {
    const { signer } = acc[0]
    await message({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Inc" },
        { name: "Amount", value: "5" }
      ]
    })
    const res = await dryrun({ pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = JSON.parse(res.Output.data)
    expect(data.count).toBe(6)
  })

  it("should decrement", async () => {
    const { signer } = acc[0]
    await message({ pid, signer, tags: [{ name: "Action", value: "Dec" }] })
    const res = await dryrun({ pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = JSON.parse(res.Output.data)
    expect(data.count).toBe(5)
  })

  it("should reset", async () => {
    const { signer } = acc[0]
    await message({ pid, signer, tags: [{ name: "Action", value: "Reset" }] })
    const res = await dryrun({ pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = JSON.parse(res.Output.data)
    expect(data.count).toBe(0)
  })

  it("should track history", async () => {
    const { signer } = acc[0]
    const res = await dryrun({ pid, signer, tags: [{ name: "Action", value: "History" }] })
    const data = JSON.parse(res.Output.data)
    expect(data.history).toBeDefined()
    expect(data.history.length).toBeGreaterThan(0)
  })
})

describe("Token App", () => {
  let pid
  let message, dryrun

  beforeAll(async () => {
    const { spawn, message: msg, dryrun: dry } = connect()
    message = msg
    dryrun = dry
    const { signer } = acc[0]

    pid = await spawn({ signer })
    const src = loadLua("token")
    await message({ pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should have token info", async () => {
    const { signer } = acc[0]
    const res = await dryrun({ pid, signer, tags: [{ name: "Action", value: "Info" }] })
    const data = JSON.parse(res.Output.data)
    expect(data.Name).toBe("VibeToken")
    expect(data.Ticker).toBe("VIBE")
    expect(data.Denomination).toBe(12)
  })

  it("should have initial balance for owner", async () => {
    const { signer, addr } = acc[0]
    const res = await dryrun({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Balance" },
        { name: "Target", value: addr }
      ]
    })
    const data = JSON.parse(res.Output.data)
    expect(Number(data.balance)).toBeGreaterThan(0)
  })

  it("should transfer tokens", async () => {
    const { signer: signer0, addr: addr0 } = acc[0]
    const { addr: addr1 } = acc[1]

    // Transfer 1000 tokens
    await message({
      pid,
      signer: signer0,
      tags: [
        { name: "Action", value: "Transfer" },
        { name: "Recipient", value: addr1 },
        { name: "Quantity", value: "1000" }
      ]
    })

    // Check recipient balance
    const res = await dryrun({
      pid,
      signer: signer0,
      tags: [
        { name: "Action", value: "Balance" },
        { name: "Target", value: addr1 }
      ]
    })
    const data = JSON.parse(res.Output.data)
    expect(data.balance).toBe("1000")
  })
})

describe("Todo App", () => {
  let pid
  let message, dryrun

  beforeAll(async () => {
    const { spawn, message: msg, dryrun: dry } = connect()
    message = msg
    dryrun = dry
    const { signer } = acc[0]

    pid = await spawn({ signer })
    const src = loadLua("todo")
    await message({ pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should add a todo", async () => {
    const { signer } = acc[0]
    const res = await message({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Add" },
        { name: "Title", value: "Learn AO" },
        { name: "Priority", value: "high" }
      ]
    })
    expect(res).toBeDefined()
  })

  it("should list todos", async () => {
    const { signer } = acc[0]
    const res = await dryrun({
      pid,
      signer,
      tags: [{ name: "Action", value: "List" }]
    })
    const data = JSON.parse(res.Output.data)
    expect(data.todos).toBeDefined()
    expect(data.todos.length).toBe(1)
    expect(data.todos[0].title).toBe("Learn AO")
    expect(data.todos[0].priority).toBe("high")
  })

  it("should complete a todo", async () => {
    const { signer } = acc[0]

    // Complete the todo
    await message({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Complete" },
        { name: "Id", value: "1" }
      ]
    })

    // Check status
    const res = await dryrun({
      pid,
      signer,
      tags: [
        { name: "Action", value: "List" },
        { name: "Status", value: "completed" }
      ]
    })
    const data = JSON.parse(res.Output.data)
    expect(data.todos.length).toBe(1)
    expect(data.todos[0].status).toBe("completed")
  })

  it("should show stats", async () => {
    const { signer } = acc[0]
    const res = await dryrun({
      pid,
      signer,
      tags: [{ name: "Action", value: "Stats" }]
    })
    const data = JSON.parse(res.Output.data)
    expect(data.total).toBe(1)
    expect(data.completed).toBe(1)
    expect(data.completionRate).toBe(100)
  })
})

describe("KV Store App", () => {
  let pid
  let message, dryrun

  beforeAll(async () => {
    const { spawn, message: msg, dryrun: dry } = connect()
    message = msg
    dryrun = dry
    const { signer } = acc[0]

    pid = await spawn({ signer })
    const src = loadLua("kv-store")
    await message({ pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should set and get a value", async () => {
    const { signer } = acc[0]

    // Set value
    await message({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Set" },
        { name: "Key", value: "greeting" }
      ],
      data: "Hello, World!"
    })

    // Get value
    const res = await dryrun({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Get" },
        { name: "Key", value: "greeting" }
      ]
    })
    const data = JSON.parse(res.Output.data)
    expect(data.value).toBe("Hello, World!")
  })

  it("should list keys", async () => {
    const { signer } = acc[0]
    const res = await dryrun({
      pid,
      signer,
      tags: [{ name: "Action", value: "List" }]
    })
    const data = JSON.parse(res.Output.data)
    expect(data.keys).toBeDefined()
    expect(data.keys.length).toBeGreaterThan(0)
  })

  it("should delete a key", async () => {
    const { signer } = acc[0]

    // Delete
    await message({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Delete" },
        { name: "Key", value: "greeting" }
      ]
    })

    // Try to get deleted key
    const res = await dryrun({
      pid,
      signer,
      tags: [
        { name: "Action", value: "Get" },
        { name: "Key", value: "greeting" }
      ]
    })
    expect(res.Output.data).toContain("error")
  })
})

// Note: More comprehensive tests for each app can be found in individual test files
// These examples demonstrate the basic patterns for testing vibe-coded apps
