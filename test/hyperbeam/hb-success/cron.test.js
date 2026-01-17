import assert from "assert"
import { after, describe, it, before, beforeEach } from "node:test"
import { wait } from "../../../src/utils.js"
import HyperBEAM from "../../../src/hyperbeam.js"

const URL = "http://localhost:10001"

describe("Hyperbeam Device", function () {
  let hb, hbeam
  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
  })

  beforeEach(async () => (hb = hbeam.hb))

  after(async () => hbeam.kill())

  it("should test cron@1.0", async () => {
    const { pid } = await hb.spawn({ "execution-device": "wao@1.0" })
    const { body: task } = await hb.post({
      path: "/~cron@1.0/every",
      "cron-path": `/~wao@1.0/cron`,
      interval: "1000-milliseconds",
      target: pid,
    })
    // Wait 4500ms to ensure at least 4 executions: t=0, t=1000, t=2000, t=3000
    await wait(4500)
    await hb.post({ path: "/~cron@1.0/stop", task: task })
    const { count } = await hb.now({ pid })
    await wait(2000)
    const { count: count2 } = await hb.now({ pid })
    // Should have at least 3 executions (timing can vary)
    assert.ok(count >= 3, `Expected count >= 3, got ${count}`)
    assert.equal(count, count2, "Count should not change after stop")
  })
})
