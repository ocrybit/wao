/**
 * Vibe Apps Tests
 *
 * Tests the vibe-coded Lua apps using ArMem (in-memory testing).
 */

import { describe, it, before } from "node:test"
import assert from "node:assert"
import { ArMem, connect, acc, scheduler } from "../../src/test.js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load Lua source files
const loadLua = (name) => {
  return readFileSync(join(__dirname, "..", "apps", `${name}.lua`), "utf-8")
}

const { signer } = acc[0]

// Helper to extract reply data from dryrun response
// msg.reply() puts data in Messages[0].Data, not Output.data
const getReplyData = (res) => {
  if (res.Messages && res.Messages.length > 0 && res.Messages[0].Data) {
    return JSON.parse(res.Messages[0].Data)
  }
  // Fallback to Output.data if present
  if (res.Output?.data) {
    return JSON.parse(res.Output.data)
  }
  throw new Error("No reply data found in response")
}

describe("Counter App", () => {
  let pid
  let message, dryrun
  let mem

  before(async () => {
    mem = new ArMem()
    const { spawn, message: msg, dryrun: dry } = connect(mem)
    message = msg
    dryrun = dry

    // Spawn process with module
    pid = await spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })

    // Load counter code
    const src = loadLua("counter")
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should start at 0", async () => {
    const res = await dryrun({ process: pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = getReplyData(res)
    assert.strictEqual(data.count, 0)
  })

  it("should increment", async () => {
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Inc" }] })
    const res = await dryrun({ process: pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = getReplyData(res)
    assert.strictEqual(data.count, 1)
  })

  it("should increment by amount", async () => {
    await message({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Inc" },
        { name: "Amount", value: "5" }
      ]
    })
    const res = await dryrun({ process: pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = getReplyData(res)
    assert.strictEqual(data.count, 6)
  })

  it("should decrement", async () => {
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Dec" }] })
    const res = await dryrun({ process: pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = getReplyData(res)
    assert.strictEqual(data.count, 5)
  })

  it("should reset", async () => {
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Reset" }] })
    const res = await dryrun({ process: pid, signer, tags: [{ name: "Action", value: "Get" }] })
    const data = getReplyData(res)
    assert.strictEqual(data.count, 0)
  })
})

describe("Token App", () => {
  let pid
  let message, dryrun
  let mem

  before(async () => {
    mem = new ArMem()
    const { spawn, message: msg, dryrun: dry } = connect(mem)
    message = msg
    dryrun = dry

    pid = await spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })
    const src = loadLua("token")
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should have token info", async () => {
    const res = await dryrun({ process: pid, signer, tags: [{ name: "Action", value: "Info" }] })
    const data = getReplyData(res)
    assert.strictEqual(data.Name, "VibeToken")
    assert.strictEqual(data.Ticker, "VIBE")
    assert.strictEqual(data.Denomination, 12)
  })

  it("should have initial balance for owner", async () => {
    const { addr } = acc[0]
    const res = await dryrun({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Balance" },
        { name: "Target", value: addr }
      ]
    })
    const data = getReplyData(res)
    assert.ok(Number(data.balance) > 0, "Owner should have initial balance")
  })

  it("should transfer tokens", async () => {
    const { addr: addr1 } = acc[1]

    // Transfer 1000 tokens
    await message({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Transfer" },
        { name: "Recipient", value: addr1 },
        { name: "Quantity", value: "1000" }
      ]
    })

    // Check recipient balance
    const res = await dryrun({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Balance" },
        { name: "Target", value: addr1 }
      ]
    })
    const data = getReplyData(res)
    assert.strictEqual(data.balance, "1000")
  })
})

describe("Todo App", () => {
  let pid
  let message, dryrun
  let mem

  before(async () => {
    mem = new ArMem()
    const { spawn, message: msg, dryrun: dry } = connect(mem)
    message = msg
    dryrun = dry

    pid = await spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })
    const src = loadLua("todo")
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should add a todo", async () => {
    const res = await message({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Add" },
        { name: "Title", value: "Learn AO" },
        { name: "Priority", value: "high" }
      ]
    })
    assert.ok(res, "Should return message result")
  })

  it("should list todos", async () => {
    const res = await dryrun({
      process: pid,
      signer,
      tags: [{ name: "Action", value: "List" }]
    })
    const data = getReplyData(res)
    assert.ok(data.todos, "Should have todos array")
    assert.strictEqual(data.todos.length, 1)
    assert.strictEqual(data.todos[0].title, "Learn AO")
    assert.strictEqual(data.todos[0].priority, "high")
  })

  it("should complete a todo", async () => {
    // Complete the todo
    await message({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Complete" },
        { name: "Id", value: "1" }
      ]
    })

    // Check status
    const res = await dryrun({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "List" },
        { name: "Status", value: "completed" }
      ]
    })
    const data = getReplyData(res)
    assert.strictEqual(data.todos.length, 1)
    assert.strictEqual(data.todos[0].status, "completed")
  })
})

describe("KV Store App", () => {
  let pid
  let message, dryrun
  let mem

  before(async () => {
    mem = new ArMem()
    const { spawn, message: msg, dryrun: dry } = connect(mem)
    message = msg
    dryrun = dry

    pid = await spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })
    const src = loadLua("kv-store")
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
  })

  it("should set and get a value", async () => {
    // Set value
    await message({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Set" },
        { name: "Key", value: "greeting" }
      ],
      data: "Hello, World!"
    })

    // Get value
    const res = await dryrun({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Get" },
        { name: "Key", value: "greeting" }
      ]
    })
    const data = getReplyData(res)
    assert.strictEqual(data.value, "Hello, World!")
  })

  it("should list keys", async () => {
    const res = await dryrun({
      process: pid,
      signer,
      tags: [{ name: "Action", value: "List" }]
    })
    const data = getReplyData(res)
    assert.ok(data.keys, "Should have keys array")
    assert.ok(data.keys.length > 0, "Should have at least one key")
  })

  it("should delete a key", async () => {
    // Delete
    await message({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Delete" },
        { name: "Key", value: "greeting" }
      ]
    })

    // Try to get deleted key - should return error or null in Messages
    const res = await dryrun({
      process: pid,
      signer,
      tags: [
        { name: "Action", value: "Get" },
        { name: "Key", value: "greeting" }
      ]
    })
    const replyData = res.Messages?.[0]?.Data || ""
    assert.ok(replyData.includes("error") || replyData.includes("null") || replyData === "", "Should return error or null for deleted key")
  })
})
