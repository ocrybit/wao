import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../src/hyperbeam.js"

/**
 * L3 API Gateway Device Tests
 * Tests the gateway@1.0 device via WAO SDK
 */
describe("L3 - API Gateway Device (gateway@1.0)", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  it("should return device info", async () => {
    const info = await hb.g("/~gateway@1.0/info")
    assert.equal(info.name, "gateway")
    assert.equal(info.version, "1.0")
  })

  it("should handle deposit and balance", async () => {
    // Deposit funds
    const depositRes = await hb.p("/~gateway@1.0/deposit", {
      amount: 1000
    })
    assert.equal(depositRes.balance, 1000)

    // Check balance
    const balanceRes = await hb.g("/~gateway@1.0/balance")
    assert.equal(balanceRes.balance, 1000)
  })

  it("should handle withdraw", async () => {
    // Deposit first
    await hb.p("/~gateway@1.0/deposit", { amount: 500 })

    // Withdraw
    const withdrawRes = await hb.p("/~gateway@1.0/withdraw", {
      amount: 200
    })
    assert.equal(withdrawRes.withdrawn, 200)
    assert.equal(withdrawRes.balance, 300)
  })

  it("should reject withdraw with insufficient balance", async () => {
    try {
      await hb.p("/~gateway@1.0/withdraw", { amount: 999999 })
      assert.fail("Should have thrown")
    } catch (e) {
      assert.ok(e.error === "insufficient_balance" || e.status >= 400)
    }
  })

  it("should make API calls and charge fees", async () => {
    // Deposit funds first
    await hb.p("/~gateway@1.0/deposit", { amount: 100 })

    // Make API call
    const apiRes = await hb.p("/~gateway@1.0/api_call", {
      action: "test_action",
      data: { foo: "bar" }
    })
    assert.ok(apiRes.charged >= 0)
    assert.ok(apiRes.balance !== undefined)
  })

  it("should schedule and list tasks", async () => {
    // Schedule a task
    const schedRes = await hb.p("/~gateway@1.0/schedule", {
      action: "periodic_task",
      cron: "0 * * * *",
      data: { key: "value" }
    })
    assert.equal(schedRes.status, "scheduled")
    assert.ok(schedRes.task_id)

    // List tasks
    const tasksRes = await hb.g("/~gateway@1.0/tasks")
    assert.ok(tasksRes.count >= 1)
    assert.ok(Array.isArray(tasksRes.tasks))
  })

  it("should add and list routes", async () => {
    // Add route
    const addRes = await hb.p("/~gateway@1.0/add_route", {
      template: "/api/v1/users/*",
      node: { prefix: "http://backend:8080" }
    })
    assert.equal(addRes.status, "added")

    // List routes
    const routesRes = await hb.g("/~gateway@1.0/routes")
    assert.ok(routesRes.count >= 1)
    assert.ok(Array.isArray(routesRes.routes))
  })
})
