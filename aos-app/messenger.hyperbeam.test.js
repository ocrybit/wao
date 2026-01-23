/**
 * Messenger AOS App Tests (HyperBEAM - Inter-Device Communication)
 *
 * Tests inter-device messaging by spawning two processes and scheduling
 * messages between them. Uses spawn() with test-device@1.0 for beta3 compatibility.
 *
 * For full mainnet WASM device-stack testing with Lua execution:
 * - Use the in-memory tests (messenger.test.js) which use ArMem with aos2_0_1
 * - The in-memory tests run with push@1.0 device for inter-process messaging
 *
 * The push@1.0 device handles message delivery from /results/outbox.
 * This test validates the SDK's ability to:
 * - Spawn multiple processes
 * - Schedule messages between processes
 * - Track message delivery chains
 *
 * Run with:
 * HB_TIMEOUT=180 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/messenger.hyperbeam.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import HyperBEAM from "../src/hyperbeam.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const messengerScript = readFileSync(
  resolve(__dirname, "messenger.lua"),
  "utf8"
)

describe("Messenger App (HyperBEAM - Inter-Device Communication)", function () {
  let hbeam, hb
  let alicePid, bobPid

  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 180,
    }).ready()

    hb = hbeam.hb
    console.log("HyperBEAM ready at", hbeam.url)
    console.log("Operator:", hb.operator)
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  describe("Multi-Process Setup", function () {
    it("should spawn Alice's process", async () => {
      const { pid } = await hb.spawn({ name: "alice-messenger" })
      alicePid = pid
      assert.ok(alicePid, "Alice's process ID should be returned")
      console.log("Alice's process:", alicePid)
    })

    it("should spawn Bob's process", async () => {
      const { pid } = await hb.spawn({ name: "bob-messenger" })
      bobPid = pid
      assert.ok(bobPid, "Bob's process ID should be returned")
      console.log("Bob's process:", bobPid)
    })

    it("should have different process IDs", async () => {
      assert.notEqual(alicePid, bobPid, "Processes should have different IDs")
      console.log("Two distinct processes spawned")
    })
  })

  describe("Inter-Process Message Scheduling", function () {
    it("should schedule registration on Alice", async () => {
      const { slot } = await hb.schedule({
        pid: alicePid,
        tags: { action: "Register", Name: "Alice" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Alice registered at slot:", slot)
    })

    it("should schedule registration on Bob", async () => {
      const { slot } = await hb.schedule({
        pid: bobPid,
        tags: { action: "Register", Name: "Bob" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Bob registered at slot:", slot)
    })

    it("should schedule contact addition on Alice", async () => {
      const { slot } = await hb.schedule({
        pid: alicePid,
        tags: { action: "AddContact", ContactId: bobPid, ContactName: "Bob" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Alice added Bob as contact at slot:", slot)
    })

    it("should schedule contact addition on Bob", async () => {
      const { slot } = await hb.schedule({
        pid: bobPid,
        tags: { action: "AddContact", ContactId: alicePid, ContactName: "Alice" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Bob added Alice as contact at slot:", slot)
    })
  })

  describe("Cross-Process Message Delivery", function () {
    it("should schedule message from Alice to Bob", async () => {
      // Alice sends a message to Bob
      // The push@1.0 device will extract from outbox and deliver
      const { slot } = await hb.schedule({
        pid: alicePid,
        tags: {
          action: "SendMessage",
          Recipient: bobPid,
          Content: "Hello Bob! Message via push@1.0",
        },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Alice -> Bob message scheduled at slot:", slot)
    })

    it("should schedule inbox check on Bob", async () => {
      const { slot } = await hb.schedule({
        pid: bobPid,
        tags: { action: "GetInbox" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Bob inbox check scheduled at slot:", slot)
    })

    it("should schedule reply from Bob to Alice", async () => {
      const { slot } = await hb.schedule({
        pid: bobPid,
        tags: {
          action: "SendMessage",
          Recipient: alicePid,
          Content: "Hi Alice! Got your message!",
        },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Bob -> Alice reply scheduled at slot:", slot)
    })

    it("should schedule inbox check on Alice", async () => {
      const { slot } = await hb.schedule({
        pid: alicePid,
        tags: { action: "GetInbox" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Alice inbox check scheduled at slot:", slot)
    })
  })

  describe("Ping/Pong Cross-Process", function () {
    it("should schedule ping from Alice to Bob", async () => {
      const { slot } = await hb.schedule({
        pid: alicePid,
        tags: { action: "Ping", Target: bobPid },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Alice ping -> Bob scheduled at slot:", slot)
    })
  })

  describe("Broadcast Cross-Process", function () {
    it("should schedule broadcast from Alice", async () => {
      const { slot } = await hb.schedule({
        pid: alicePid,
        tags: { action: "Broadcast", Content: "Broadcast to all contacts!" },
      })
      assert.ok(slot !== undefined, "Slot should be returned")
      console.log("Alice broadcast scheduled at slot:", slot)
    })
  })

  // Note: now() and compute() with ~json@1.0/serialize can fail with test-device@1.0
  // The in-memory tests verify full messenger functionality including:
  // - Message sending and receiving between processes
  // - Contact management
  // - Inbox/outbox operations
  // HyperBEAM tests verify SDK operations: spawn, schedule work correctly
})

describe("Messenger Script Validation", function () {
  it("should use push@1.0 device", () => {
    assert.ok(
      messengerScript.includes("push@1.0"),
      "Should reference push@1.0 device"
    )
  })

  it("should use Send() for inter-device messaging", () => {
    assert.ok(
      messengerScript.includes("Send({"),
      "Should use Send() for message delivery"
    )
  })

  it("should have all messaging handlers", () => {
    const handlers = [
      "SendMessage",
      "ReceiveMessage",
      "MessageReceived",
      "Ping",
      "Pong",
      "PongResponse",
      "Broadcast",
    ]
    for (const handler of handlers) {
      assert.ok(
        messengerScript.includes(`Handlers.add("${handler}"`),
        `Should have ${handler} handler`
      )
    }
  })

  it("should have contact management", () => {
    const handlers = ["AddContact", "ListContacts"]
    for (const handler of handlers) {
      assert.ok(
        messengerScript.includes(`Handlers.add("${handler}"`),
        `Should have ${handler} handler`
      )
    }
  })

  it("should have inbox/outbox management", () => {
    const handlers = ["GetInbox", "GetOutbox", "ClearInbox"]
    for (const handler of handlers) {
      assert.ok(
        messengerScript.includes(`Handlers.add("${handler}"`),
        `Should have ${handler} handler`
      )
    }
  })
})
