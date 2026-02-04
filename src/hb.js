import { createSigner } from "@permaweb/aoconnect"
import { isEmpty, last, isNotNil, mergeLeft, clone } from "ramda"
import { toAddr, buildTags, seed } from "./utils.js"
import {
  httpsig_from,
  structured_to,
  rsaid,
  hmacid,
  sign,
  signer,
  send as _send,
  commit,
  result,
} from "hbsig"
import hyper_aos from "./hyper-aos.js"
import aos_wamr from "./aos_wamr.js"
import { ArweaveSigner } from "@ar.io/sdk"
import { createData } from "@dha-team/arbundles"

const toMsg = async req => {
  let msg = {}
  req?.headers?.forEach((v, k) => {
    msg[k] = v
  })
  //if (req.body) msg.body = await req.text?.()
  if (req.body) {
    const arrayBuffer = await req.arrayBuffer()
    msg.body =
      typeof Buffer !== "undefined"
        ? Buffer.from(arrayBuffer) // Node.js
        : new Uint8Array(arrayBuffer) // Browser
  }
  return msg
}

class HB {
  constructor({
    url = "http://localhost:10001",
    cu = "http://localhost:6363",
    jwk,
    format = "httpsig",
  } = {}) {
    this.format = format
    this.cu = cu
    this.url = url
    if (jwk) this._init(jwk)
  }
  async signEncoded(encoded) {
    const { path, ...msg } = encoded
    return await sign({
      jwk: this.jwk,
      msg,
      path,
      url: this.url,
    })
  }

  isArConnect() {
    return this.jwk?.id || this.jwk?.walletName === "ArConnect"
  }

  _init(jwk) {
    this.jwk = jwk
    this.signer = createSigner(jwk, this.url)
    if (this.jwk && !this.isArConnect()) this.addr = toAddr(jwk.n)
    this.sign = signer({ signer: this.signer, url: this.url })
  }

  async setInfo() {
    if (!this.operator) {
      try {
        this.operator = await this.g("/~meta@1.0/info/address")
      } catch (e) {
        console.log(e)
      }
    }
  }

  async init(jwk) {
    this._init(jwk)
    await this.setInfo()
    return this
  }

  async send(msg) {
    return await _send(msg)
  }

  async getImage() {
    const wasm = Buffer.from(aos_wamr, "base64")
    const id = await this.cacheBinary(wasm, "application/wasm")
    this.image ??= id
    return id
  }

  async getLua() {
    const lua = Buffer.from(hyper_aos, "base64")
    const id = await this.cacheBinary(lua, "application/lua")
    this.lua ??= id
    return id
  }

  async messageAOS(args) {
    const { slot, pid } = await this.scheduleAOS(args)
    return { slot, outbox: await this.computeAOS({ pid, slot }) }
  }

  async messageLegacy(args) {
    const { slot, pid } = await this.scheduleLegacy(args)
    return { slot, res: await this.computeLegacy({ pid, slot }) }
  }

  async computeAOS({ pid, slot }) {
    return await this.getJSON({ path: `/${pid}/compute/results/outbox`, slot })
  }

  async computeLua({ pid, slot }) {
    return await this.getJSON({ path: `/${pid}/compute/results`, slot })
  }

  async compute({ pid, slot, path = "" }) {
    if (path && !/^\//.test(path)) path = "/" + path
    if (this.format === "ans104") {
      const res = await this.get({ path: `/${pid}/compute${path}`, slot })
      return res.out
    } else {
      return await this.getJSON({ path: `/${pid}/compute${path}`, slot })
    }
  }

  async computeLegacy({ pid, slot }) {
    // In beta3, try to get results directly via bundle format which avoids cache lazy link issues
    try {
      const json = await this.compute({ pid, slot, path: "/results/json" })
      const result = JSON.parse(json.body)
      return result
    } catch (e) {
      // Fallback: get results via bundle and extract Output
      const res = await this.getJSON({
        path: `/${pid}/compute/results`,
        slot,
        headers: { "accept-bundle": "true" }
      })
      // Convert bundle format to legacy format
      const output = res.Output || {}
      return {
        Messages: output.Messages || [],
        Spawns: output.Spawns || [],
        Output: output.Output || "",
        Error: output.Error,
      }
    }
  }

  async cacheScript(data, type = "application/lua") {
    if (!this.cache) {
      const { pid } = await this.spawn({})
      this.cache = pid
    }
    const { slot } = await this.scheduleFlat({
      data,
      pid: this.cache,
      tags: { "Content-Type": type },
    })
    const msgs = await this.messages({ pid: this.cache, from: slot, limit: 1 })
    return msgs.edges[0].node.message.Id
  }

  async cacheBinary(data, type) {
    const res = await this.post({ path: "/~wao@1.0/cache_module", data, type })
    return res.out.id
  }

  async message(args) {
    const pid = args.pid
    const { slot } = await this.schedule(args)
    const res = await this.compute({ pid, slot })
    return { slot, pid, res }
  }

  async scheduleFlat({ pid, tags = {}, data } = {}) {
    let _tags = mergeLeft(tags, { Type: "Message", target: pid })
    if (data) _tags.data = data
    let res = await this.post({ path: "/~process@1.0/schedule", body: _tags })
    return { slot: res.out.slot, res, pid }
  }

  async scheduleNP({ pid, tags = {}, data } = {}) {
    if (data) tags.data = data
    let res = await this.post({
      path: `/${pid}~node-process@1.0/schedule`,
      body: await this.commit(tags),
    })
    return { slot: res.out.slot, res, pid }
  }

  async send104({ path = "/~process@1.0/schedule", item }) {
    let res = await fetch(`${this.url}${path}`, {
      method: "POST",
      headers: {
        "codec-device": "ans104@1.0",
        "Content-Type": "application/ans104",
      },
      body: item.binary,
    })
    return await result(res)
  }

  async post104({
    path = "/~process@1.0/schedule",
    tags = {},
    data = "1984",
    target,
  }) {
    const _tags = buildTags(mergeLeft(tags, { signingFormat: "ANS-104" }))
    const signer = new ArweaveSigner(this.jwk)
    const item = createData(data, signer, { tags: _tags, target })
    await item.sign(signer)
    return await this.send104({ path, item })
  }

  async schedule({ pid, tags = {}, data } = {}) {
    let res = null
    if (this.format === "ans104") {
      let _tags = mergeLeft(tags, { Type: "Message" })
      res = await this.post104({
        target: pid,
        path: `/${pid}/schedule`,
        tags: _tags,
        data: data ?? "1984",
      })
      return { slot: res.out.slot, res, pid }
    } else {
      let _tags = mergeLeft(tags, { type: "Message", target: pid })
      if (data) _tags.data = data

      const res = await this.post({
        path: "/~scheduler@1.0/schedule",
        ..._tags,
      })

      const slot = parseInt(res.headers?.slot ?? res.out?.slot)
      return {
        slot,
        pid,
        res: { status: res.status },
      }
    }
  }

  async scheduleLua({ action = "Eval", tags = {}, ...rest }) {
    if (action) tags.action = action
    return await this.schedule({ tags, ...rest })
  }

  async spawnLua(lua) {
    await this.setInfo()
    // Note: 'authority' excluded - conflicts with HTTP Message Signatures '@authority'
    const tags = {
      "data-protocol": "ao",
      variant: "ao.N.1",
      module: this.lua ?? (await this.getLua()),
      "execution-device": "lua@5.3a",
      "push-device": "push@1.0",
      "patch-from": "/results/outbox",
    }
    return this.spawn(tags)
  }

  async now({ pid, path = "" }) {
    if (path && !/^\//.test(path)) path = "/" + path
    if (this.format === "ans104") {
      const res = await this.get({ path: `/${pid}/now${path}` })
      return res.out
    } else {
      return await this.getJSON({ path: `/${pid}/now${path}` })
    }
  }

  async slot({ pid, path = "" }) {
    if (path && !/^\//.test(path)) path = "/" + path
    return await this.getJSON({ path: `/${pid}/slot${path}` })
  }

  async messages({ pid, from, to } = {}) {
    let params = `target=${pid}`
    if (isNotNil(from)) params += `&from=${from}`
    if (isNotNil(to)) params += `&to=${to}`
    params += `&accept=application/aos-2`
    let res = await fetch(`${this.url}/~scheduler@1.0/schedule?${params}`).then(
      r => r.json()
    )
    if (res.page_info.has_next_page) {
      res.next = async () => {
        const from2 = last(res.edges).cursor + 1
        return await this.messages({ pid, from: from2, to })
      }
    }
    return res
  }
  async spawn(tags = {}) {
    await this.setInfo()
    let res = null
    if (this.format === "ans104") {
      res = await this.post104({
        tags: mergeLeft(tags, {
          "codec-device": "ans104@1.0",
          "random-seed": seed(16),
          Type: "Process",
          "execution-device": "test-device@1.0",
          device: "process@1.0",
          Scheduler: this.operator,
        }),
      })
      return { res, pid: res.out.process }
    } else {
      // Use httpsig-signed multipart POST (beta3-compatible approach)
      const spawnTags = mergeLeft(tags, {
        "random-seed": seed(16),
        type: "Process",
        "execution-device": "test-device@1.0",
        device: "process@1.0",
        scheduler: this.operator ?? this.addr,
      })

      const res = await this.post({
        path: "/~scheduler@1.0/schedule",
        ...spawnTags,
      })

      return {
        pid: res.headers?.process || res.out?.process,
        slot: parseInt(res.headers?.slot ?? res.out?.slot),
        res: { status: res.status },
      }
    }
  }

  async spawnLegacy({ module, tags = {}, data } = {}) {
    await this.setInfo()
    // Use genesis-wasm directly as execution-device for legacynet AOS
    const legacyTags = {
      "data-protocol": "ao",
      variant: "ao.TN.1",
      scheduler: this.operator ?? this.addr,
      module: module ?? "ISShJH1ij-hPPt9St5UFFr_8Ys3Kj5cyg7zrMGt7H9s",
      device: "process@1.0",
      "execution-device": "genesis-wasm@1.0",
      "random-seed": seed(16),
      type: "Process",
    }
    const t = mergeLeft(tags, legacyTags)
    if (data) t.data = data

    // Use httpsig-signed multipart POST (beta3-compatible approach)
    const res = await this.post({
      path: "/~scheduler@1.0/schedule",
      ...t,
    })

    return {
      pid: res.headers?.process || res.out?.process,
      slot: parseInt(res.headers?.slot ?? res.out?.slot),
      res: { status: res.status },
    }
  }

  async scheduleLegacy({ action = "Eval", tags = {}, ...rest } = {}) {
    // Use lowercase 'action' to match HTTP Message Signature field normalization
    if (action) tags.action = action
    return await this.schedule({ tags, ...rest })
  }

  async results({ process, limit, sort = "DESC", from, to } = {}) {
    let params = ""
    const addParam = (key, val) => {
      params += params === "" ? "?" : "&"
      params += `${key}=${val}`
    }
    if (limit) addParam("limit", limit)
    if (sort) addParam("sort", sort)
    if (from) addParam("from", from)
    if (to) addParam("to", to)
    const res = await this.post({
      path: "/~relay@1.0/call",
      method: "GET",
      "relay-path": `${this.cu}/results/${process}${params}`,
      "Content-Type": "application/json",
    })
    return JSON.parse(res.body)
  }

  async dryrun({ tags = {}, pid, action, data } = {}) {
    if (typeof action === "string") tags.action = action
    let json = { Tags: buildTags({ ...tags }), Owner: this.addr }
    if (data) json.Data = data
    const res = await this.post({
      path: "/~relay@1.0/call",
      method: "POST",
      "relay-path": `${this.cu}/dry-run?process-id=${pid}`,
      "Content-Type": "application/json",
      "relay-body": JSON.stringify(json),
    })
    return JSON.parse(res.body)
  }

  async commit(obj, opts) {
    return await commit(obj, { ...opts, signer: this.sign })
  }

  async p(path, ...args) {
    let _args = clone(args)
    _args[0] ??= {}
    _args[0].path ??= path
    return (await this.post(..._args))?.out ?? null
  }

  async post(obj, opt = {}) {
    const _json = opt.json ? "/~json@1.0/serialize" : ""
    obj.path += _json
    // Flatten nested 'body' object to top-level fields for JSON POST.
    // Old API used body: { key: value } for multipart POST; now these
    // fields must be at the top level for JSON POST with commitments.
    if (obj.body && typeof obj.body === "object" && !Buffer.isBuffer(obj.body)
        && !(obj.body instanceof Blob) && !Array.isArray(obj.body)) {
      const { body, ...rest } = obj
      obj = { ...rest, ...body }
    }
    // Convert Buffer body to UTF-8 string for JSON POST.
    // JSON can't represent raw binary; Buffers get base64-encoded by JSON.stringify,
    // which causes content-digest hash mismatch (SHA-256 of base64 ≠ SHA-256 of binary).
    // Converting to string before signing ensures the signed content matches the JSON value.
    if (Buffer.isBuffer(obj.body)) {
      obj.body = obj.body.toString()
    }
    // Remove ao-body-key when it points to "body" - the encoding pipeline handles
    // "body" fields natively without this header. When ao-body-key: "body" is signed,
    // it causes invalid_commitment because HyperBEAM's to() doesn't produce ao-body-key
    // for "body" fields (only for non-default names like "data").
    if (obj["ao-body-key"] === "body") {
      delete obj["ao-body-key"]
    }
    // Add nonce to ensure committed list is never empty.
    // HyperBEAM rejects messages with empty committed lists as invalid_commitment.
    // This also prevents replay attacks.
    obj.nonce ??= seed(8)
    // Always use JSON POST with commitment signatures (beta3-compatible)
    // path: false because @path derived component causes mismatch when
    // HyperBEAM reconstructs signature base from committed field "path"
    // All field values are header strings; ao-types guides type conversion
    const committed = await this.commit(obj, { path: false })
    const jsonReplacer = (key, value) => {
      if (value?.type === "Buffer" && Array.isArray(value?.data)) {
        return Buffer.from(value.data).toString("base64")
      }
      if (Buffer.isBuffer(value)) {
        return value.toString("base64")
      }
      return value
    }
    const jsonBody = JSON.stringify(committed, jsonReplacer)
    const response = await fetch(`${this.url}${obj.path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: jsonBody,
    })
    if (response.status >= 400) {
      const text = await response.text()
      throw new Error(`${response.status}: ${text}`)
    }
    return await result(response)
  }

  // Decode base64-encoded multipart body from HyperBEAM responses.
  // When HyperBEAM returns cached/stored messages, the body may be
  // base64-encoded multipart form-data. This method decodes it and
  // extracts parts based on the ao-result header.
  _decodeResult(res) {
    if (!res.body || typeof res.body !== "string") return res
    const aoResult = res.headers?.["ao-result"]

    // Try to detect and decode base64-encoded multipart body
    try {
      const decoded = Buffer.from(res.body, "base64").toString("binary")
      if (decoded.startsWith("--") && decoded.includes("content-disposition")) {
        // It's multipart form-data encoded as base64
        res.body = decoded

        if (aoResult) {
          // Extract the named part from multipart
          const boundaryMatch = decoded.match(/^--([^\r\n]+)/)
          if (boundaryMatch) {
            const boundary = boundaryMatch[1]
            const parts = decoded.split(`--${boundary}`)
            for (const part of parts) {
              if (!part || part.startsWith("--")) continue
              const nameMatch = part.match(/name="([^"]+)"/)
              if (nameMatch && nameMatch[1] === aoResult) {
                const sepIdx = part.indexOf("\r\n\r\n")
                if (sepIdx !== -1) {
                  let content = part.substring(sepIdx + 4)
                  // Remove trailing CRLF
                  content = content.replace(/\r\n$/, "")
                  res.out = content
                }
                break
              }
            }
          }
        }
      }
    } catch (e) {
      // Not valid base64 or not multipart - use as-is
    }

    return res
  }

  async g(path, ...args) {
    let _args = clone(args)
    _args[0] ??= {}
    _args[0].path ??= path
    return (await this.get(..._args))?.out ?? null
  }

  async get({ path, ...params }, opt = {}) {
    const _json = opt.json ? "/~json@1.0/serialize" : ""
    path ??= "/~message@1.0"
    if (!/^\//.test(path)) path = "/" + path
    let _params = ""
    if (!isEmpty(params)) {
      let i = 0
      for (const k in params) {
        _params += `${i === 0 ? "?" : "&"}${k}=${params[k]}`
        i++
      }
    }
    // Add accept-bundle header to get inline data instead of links (beta3 compatibility)
    const response = await fetch(`${this.url}${path}${_json}${_params}`, {
      headers: { "accept-bundle": "true" }
    })
    return this._decodeResult(await result(response))
  }

  async postJSON(args, opt = {}) {
    const res = await this.post(args, { ...opt, json: true })
    return JSON.parse(res.body)
  }

  async getJSON(args, opt = {}) {
    // Use regular GET with structured output instead of json@1.0/serialize
    // because the JSON serializer doesn't resolve linkified fields (body+link)
    const res = await this.get(args, opt)
    return res.out
  }
  async spawnAOS(image) {
    await this.setInfo()
    image ??= this.image ?? (await this.getImage())
    // Use JSON POST with commitment signatures (beta3-compatible approach)
    // Note: 'authority' excluded - conflicts with HTTP Message Signatures '@authority'
    const tags = {
      "data-protocol": "ao",
      variant: "ao.N.1",
      image,
      "execution-device": "stack@1.0",
      "push-device": "push@1.0",
      "device-stack": [
        "wasi@1.0",
        "json-iface@1.0",
        "wasm-64@1.0",
        "patch@1.0",
        "multipass@1.0",
      ],
      "output-prefix": "wasm",
      "patch-from": "/results/outbox",
      "patch-mode": "patches",
      passes: 2,
      "random-seed": seed(16),
      type: "Process",
      device: "process@1.0",
      scheduler: this.operator ?? this.addr,
    }

    // Use httpsig-signed multipart POST (beta3-compatible approach)
    const res = await this.post({
      path: "/~scheduler@1.0/schedule",
      ...tags,
    })

    return {
      pid: res.headers?.process || res.out?.process,
      slot: parseInt(res.headers?.slot ?? res.out?.slot),
      res: { status: res.status },
    }
  }

  async scheduleAOS({ action = "Eval", tags = {}, ...rest }) {
    if (action) tags.action = action
    return await this.schedule({ tags, ...rest })
  }
}

export default HB
