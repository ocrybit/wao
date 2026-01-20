import assert from "assert"
import { describe, it } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Hyperbeam Eunit", function () {
  // Note: eunit runs rebar3 tests directly, doesn't need server running
  // The eunit method requires logs:true for promise to resolve (due to implementation)

  it("should run eunit dev_message", async () => {
    const hbeam = new HyperBEAM({ reset: false, shell: false, logs: true })
    await hbeam.eunit("dev_message")
  })
})
