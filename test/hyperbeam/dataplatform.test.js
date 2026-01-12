import assert from "assert"
import { after, describe, it, before } from "node:test"
import HyperBEAM from "../../src/hyperbeam.js"

/**
 * L4 Data Platform Device Tests
 * Tests the dataplatform@1.0 device via WAO SDK
 */
describe("L4 - Data Platform Device (dataplatform@1.0)", function () {
  let hb, hbeam

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  it("should return device info", async () => {
    const info = await hb.g("/~dataplatform@1.0/info")
    assert.equal(info.name, "dataplatform")
    assert.equal(info.version, "1.0")
  })

  it("should upload data", async () => {
    const result = await hb.p("/~dataplatform@1.0/upload", {
      data: "Hello Arweave!",
      tags: { "Content-Type": "text/plain" }
    })
    assert.ok(result.id)
    assert.equal(result.status, "uploaded")
    assert.ok(result.size > 0)
  })

  it("should query uploaded data by ID", async () => {
    // First upload
    const uploadRes = await hb.p("/~dataplatform@1.0/upload", {
      data: "Test data for query"
    })
    const itemId = uploadRes.id

    // Then query
    const queryRes = await hb.g(`/~dataplatform@1.0/query?id=${itemId}`)
    assert.equal(queryRes.id, itemId)
    assert.equal(queryRes.data, "Test data for query")
  })

  it("should query data by tags", async () => {
    const uniqueTag = "test_tag_" + Date.now()

    // Upload with tags
    await hb.p("/~dataplatform@1.0/upload", {
      data: "Tagged data",
      tags: { category: uniqueTag }
    })

    // Query by tags
    const result = await hb.p("/~dataplatform@1.0/query_by_tags", {
      tags: { category: uniqueTag }
    })
    assert.ok(result.total >= 1)
    assert.ok(Array.isArray(result.results))
  })

  it("should check upload status", async () => {
    // Upload first
    const uploadRes = await hb.p("/~dataplatform@1.0/upload", {
      data: "Status check data"
    })

    // Check status
    const statusRes = await hb.g(`/~dataplatform@1.0/upload_status?id=${uploadRes.id}`)
    assert.equal(statusRes.id, uploadRes.id)
    assert.equal(statusRes.status, "uploaded")
  })

  it("should create and verify bundles", async () => {
    // Create bundle
    const bundleRes = await hb.p("/~dataplatform@1.0/create_bundle", {
      items: [
        { data: "Item 1", tags: { type: "test" } },
        { data: "Item 2", tags: { type: "test" } }
      ]
    })
    assert.ok(bundleRes.bundle_id)
    assert.equal(bundleRes.item_count, 2)
    assert.ok(Array.isArray(bundleRes.item_ids))
    assert.equal(bundleRes.item_ids.length, 2)

    // Verify bundle
    const verifyRes = await hb.g(`/~dataplatform@1.0/verify_bundle?bundle_id=${bundleRes.bundle_id}`)
    assert.equal(verifyRes.valid, true)
    assert.equal(verifyRes.item_count, 2)
  })

  it("should manage nodes", async () => {
    // Initially empty or has some nodes
    const initialNodes = await hb.g("/~dataplatform@1.0/nodes")
    const initialCount = initialNodes.count

    // Add node
    const nodeUrl = "http://node_" + Date.now() + ".example"
    const addRes = await hb.p("/~dataplatform@1.0/add_node", {
      url: nodeUrl
    })
    assert.equal(addRes.message, "node_added")

    // List nodes
    const nodesRes = await hb.g("/~dataplatform@1.0/nodes")
    assert.equal(nodesRes.count, initialCount + 1)

    // Remove node
    const removeRes = await hb.p("/~dataplatform@1.0/remove_node", {
      url: nodeUrl
    })
    assert.equal(removeRes.message, "node_removed")

    // Verify removed
    const finalNodes = await hb.g("/~dataplatform@1.0/nodes")
    assert.equal(finalNodes.count, initialCount)
  })
})
