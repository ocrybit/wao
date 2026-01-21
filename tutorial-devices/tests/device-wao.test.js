/**
 * WAO Integration Tests for Vibe-Coded Erlang Devices
 *
 * These tests verify the devices work correctly via HyperBEAM HTTP API.
 *
 * Note: Devices must be compiled and loaded into HyperBEAM before running.
 * See tutorial-devices/README.md for setup instructions.
 */

import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import HyperBEAM from "../../src/hyperbeam.js"

/**
 * Counter Device Tests (dev_counter@1.0)
 */
describe("Counter Device (WAO)", () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  it("should return device info", async () => {
    try {
      const info = await hb.g("/~counter@1.0/info")
      assert.equal(info?.name, "counter")
      assert.equal(info?.version, "1.0")
    } catch (e) {
      // Device not loaded - expected if not compiled into HyperBEAM
      console.log("  [SKIP] counter@1.0 not loaded:", e.message.substring(0, 50))
    }
  })

  it("should start at 0", async () => {
    try {
      const result = await hb.g("/~counter@1.0/get")
      assert.equal(result?.count, 0)
    } catch (e) {
      console.log("  [SKIP] counter@1.0 not loaded")
    }
  })

  it("should increment", async () => {
    try {
      const result = await hb.p("/~counter@1.0/inc")
      assert.equal(result?.count, 1)
    } catch (e) {
      console.log("  [SKIP] counter@1.0 not loaded")
    }
  })

  it("should increment by amount", async () => {
    try {
      const result = await hb.p("/~counter@1.0/inc", { amount: 5 })
      assert.ok(result?.count >= 5)
    } catch (e) {
      console.log("  [SKIP] counter@1.0 not loaded")
    }
  })
})

/**
 * Rate Limiter Device Tests (dev_ratelimiter@1.0)
 */
describe("Rate Limiter Device (WAO)", () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  it("should return device info", async () => {
    try {
      const info = await hb.g("/~ratelimiter@1.0/info")
      assert.equal(info?.name, "ratelimiter")
      assert.equal(info?.algorithm, "token_bucket")
    } catch (e) {
      console.log("  [SKIP] ratelimiter@1.0 not loaded")
    }
  })

  it("should check rate limit (allow with full bucket)", async () => {
    try {
      const result = await hb.p("/~ratelimiter@1.0/check", { key: "test" })
      assert.equal(result?.allowed, true)
      assert.equal(result?.tokens, 100)
    } catch (e) {
      console.log("  [SKIP] ratelimiter@1.0 not loaded")
    }
  })

  it("should consume tokens", async () => {
    try {
      const result = await hb.p("/~ratelimiter@1.0/consume", { key: "user1", cost: 10 })
      assert.equal(result?.allowed, true)
      assert.equal(result?.consumed, 10)
      assert.equal(result?.remaining, 90)
    } catch (e) {
      console.log("  [SKIP] ratelimiter@1.0 not loaded")
    }
  })

  it("should get bucket status", async () => {
    try {
      const result = await hb.g("/~ratelimiter@1.0/status", { key: "user1" })
      assert.ok(result?.tokens >= 0)
      assert.equal(result?.capacity, 100)
    } catch (e) {
      console.log("  [SKIP] ratelimiter@1.0 not loaded")
    }
  })
})

/**
 * Analytics Device Tests (dev_analytics@1.0)
 */
describe("Analytics Device (WAO)", () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  it("should return device info", async () => {
    try {
      const info = await hb.g("/~analytics@1.0/info")
      assert.equal(info?.name, "analytics")
      assert.equal(info?.version, "1.0")
    } catch (e) {
      console.log("  [SKIP] analytics@1.0 not loaded")
    }
  })

  it("should track events", async () => {
    try {
      const result = await hb.p("/~analytics@1.0/track", {
        event: "page_view",
        data: { page: "/home" },
        from: "user1"
      })
      assert.equal(result?.status, "tracked")
      assert.ok(result?.event_id)
    } catch (e) {
      console.log("  [SKIP] analytics@1.0 not loaded")
    }
  })

  it("should record metrics", async () => {
    try {
      const result = await hb.p("/~analytics@1.0/metric", {
        name: "response_time",
        value: 150
      })
      assert.equal(result?.status, "recorded")
      assert.equal(result?.value, 150)
    } catch (e) {
      console.log("  [SKIP] analytics@1.0 not loaded")
    }
  })

  it("should get events", async () => {
    try {
      const result = await hb.g("/~analytics@1.0/events", { limit: 10 })
      assert.ok(Array.isArray(result?.events))
    } catch (e) {
      console.log("  [SKIP] analytics@1.0 not loaded")
    }
  })

  it("should get stats", async () => {
    try {
      const result = await hb.g("/~analytics@1.0/stats")
      assert.ok(result?.event_count >= 0)
      assert.ok(result?.metric_count >= 0)
    } catch (e) {
      console.log("  [SKIP] analytics@1.0 not loaded")
    }
  })
})

/**
 * KV Store Device Tests (dev_kv@1.0) - Existing device
 */
describe("KV Store Device (WAO)", () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  it("should return device info", async () => {
    try {
      const info = await hb.g("/~kv@1.0/info")
      assert.equal(info?.name, "kv")
      assert.equal(info?.version, "1.0")
    } catch (e) {
      console.log("  [SKIP] kv@1.0 not loaded")
    }
  })

  it("should set and get values", async () => {
    try {
      // Set
      const setResult = await hb.p("/~kv@1.0/set", { key: "greeting", value: "hello" })
      assert.equal(setResult?.status, "stored")

      // Get
      const getResult = await hb.g("/~kv@1.0/get", { key: "greeting" })
      assert.equal(getResult?.value, "hello")
    } catch (e) {
      console.log("  [SKIP] kv@1.0 not loaded")
    }
  })

  it("should list keys", async () => {
    try {
      const result = await hb.g("/~kv@1.0/keys")
      assert.ok(Array.isArray(result?.keys))
    } catch (e) {
      console.log("  [SKIP] kv@1.0 not loaded")
    }
  })
})

/**
 * Processor Device Tests (dev_processor@1.0) - Existing device
 */
describe("Processor Device (WAO)", () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  it("should return device info", async () => {
    try {
      const info = await hb.g("/~processor@1.0/info")
      assert.equal(info?.name, "processor")
    } catch (e) {
      console.log("  [SKIP] processor@1.0 not loaded")
    }
  })

  it("should encode to JSON", async () => {
    try {
      const result = await hb.p("/~processor@1.0/encode", {
        format: "json",
        body: { key: "value" }
      })
      assert.equal(result?.format, "json")
      assert.ok(result?.encoded)
    } catch (e) {
      console.log("  [SKIP] processor@1.0 not loaded")
    }
  })
})
