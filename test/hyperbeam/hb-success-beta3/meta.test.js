import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Meta Device", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
  })

  beforeEach(async () => {
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  describe("meta@1.0/info endpoint", function () {
    it("should get full info object with essential fields", async () => {
      const info = await hb.g("/~meta@1.0/info")

      // Check essential fields
      assert.equal(info.port, 10001, "port should be 10001")
      assert.equal(info.address, hb.addr, "address should match client address")
      assert.equal(info.initialized, "true", "initialized should be 'true'")
      assert.ok(info["compute_mode"], "should have compute_mode")
      assert.ok(info["mode"], "should have mode")
    })

    it("should get info/address", async () => {
      const address = await hb.g("/~meta@1.0/info/address")
      assert.equal(address, hb.addr, "address should match client address")
    })

    it("should get info/port", async () => {
      const port = await hb.g("/~meta@1.0/info/port")
      assert.equal(port, "10001", "port should be 10001")
    })

    it("should get info/initialized", async () => {
      const initialized = await hb.g("/~meta@1.0/info/initialized")
      assert.equal(initialized, "true", "should be initialized")
    })

    it("should get info/compute_mode", async () => {
      const mode = await hb.g("/~meta@1.0/info/compute_mode")
      assert.ok(["lazy", "eager"].includes(mode), "compute_mode should be lazy or eager")
    })

    it("should get info/mode", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok(info.mode, "should have mode field")
    })

    it("should have gateway configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok(info.gateway, "should have gateway configured")
    })

    it("should have http client/server configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok(info.http_client, "should have http_client")
      assert.ok(info.http_server, "should have http_server")
    })
  })

  describe("meta@1.0/build endpoint", function () {
    it("should get build info with node name", async () => {
      const build = await hb.g("/~meta@1.0/build")
      assert.equal(build.node, "HyperBEAM", "node should be HyperBEAM")
    })

    it("should have version info", async () => {
      const build = await hb.g("/~meta@1.0/build")
      assert.ok(build.version, "should have version")
    })

    it("should have source info", async () => {
      const build = await hb.g("/~meta@1.0/build")
      assert.ok(build.source, "should have source")
      assert.ok(build["source-short"], "should have source-short")
    })

    it("should have build time", async () => {
      const build = await hb.g("/~meta@1.0/build")
      assert.ok(build["build-time"], "should have build-time")
      // Build time should be a timestamp (number)
      const buildTime = parseInt(build["build-time"])
      assert.ok(buildTime > 1700000000, "build-time should be a recent timestamp")
    })
  })

  describe("meta info contains expected configuration keys", function () {
    it("should have debug configuration keys", async () => {
      const info = await hb.g("/~meta@1.0/info")
      // Check for presence of some debug keys (they exist as keys even if values vary)
      const debugKeys = Object.keys(info).filter(k => k.startsWith("debug_"))
      assert.ok(debugKeys.length > 0, "should have debug configuration keys")
    })

    it("should have http configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      const httpKeys = ["http_client", "http_server", "http_connect_timeout", "http_keepalive"]
      for (const key of httpKeys) {
        assert.ok(key in info, `should have ${key}`)
      }
    })

    it("should have wasm configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok("wasm_allow_aot" in info, "should have wasm_allow_aot")
    })

    it("should have scheduling configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok("scheduling_mode" in info, "should have scheduling_mode")
      assert.ok("scheduler_location_ttl" in info, "should have scheduler_location_ttl")
    })

    it("should have commitment configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok("commitment_device" in info, "should have commitment_device")
    })

    it("should have store configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      // store is a +link reference, check it exists
      assert.ok("store+link" in info || "store" in info, "should have store configuration")
    })

    it("should have preloaded_devices configuration", async () => {
      const info = await hb.g("/~meta@1.0/info")
      // preloaded_devices is a +link reference
      assert.ok(
        "preloaded_devices+link" in info || "preloaded_devices" in info,
        "should have preloaded_devices configuration"
      )
    })
  })
})
