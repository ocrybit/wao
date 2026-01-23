import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { ArMem, connect, acc, scheduler } from '../../src/test.js'

const luaCode = readFileSync(new URL('./app.lua', import.meta.url), 'utf-8')

describe('Counter App (Mainnet WASM)', () => {
  let mem, spawn, message, dryrun, pid

  before(async () => {
    mem = new ArMem()
    const conn = connect(mem)
    spawn = conn.spawn
    message = conn.message
    dryrun = conn.dryrun

    // Spawn process with aos2_0_6
    pid = await spawn({
      signer: acc[0].signer,
      scheduler,
      module: mem.modules.aos2_0_6,
    })

    // Load Lua code
    await message({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Eval" }],
      data: luaCode,
    })
  })

  it('should return info', async () => {
    const res = await dryrun({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Info" }],
    })
    const data = JSON.parse(res.Messages[0].Data)
    assert.strictEqual(data.name, 'counter')
    assert.strictEqual(data.version, '1.0')
  })

  it('should increment counter', async () => {
    await message({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Inc" }],
    })
    const res = await dryrun({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Get" }],
    })
    const data = JSON.parse(res.Messages[0].Data)
    assert.strictEqual(data.count, 1)
  })

  it('should increment by custom amount', async () => {
    await message({
      process: pid,
      signer: acc[0].signer,
      tags: [
        { name: "Action", value: "Inc" },
        { name: "Amount", value: "5" },
      ],
    })
    const res = await dryrun({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Get" }],
    })
    const data = JSON.parse(res.Messages[0].Data)
    assert.strictEqual(data.count, 6)
  })

  it('should decrement counter', async () => {
    await message({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Dec" }],
    })
    const res = await dryrun({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Get" }],
    })
    const data = JSON.parse(res.Messages[0].Data)
    assert.strictEqual(data.count, 5)
  })

  it('should reset counter', async () => {
    await message({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Reset" }],
    })
    const res = await dryrun({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Get" }],
    })
    const data = JSON.parse(res.Messages[0].Data)
    assert.strictEqual(data.count, 0)
  })
})
