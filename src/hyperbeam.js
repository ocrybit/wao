import { spawn, spawnSync } from "child_process"
import { resolve } from "path"
import { isNil, map } from "ramda"
import { toAddr } from "./test.js"
import HB from "./hb.js"
import { rmSync, readFileSync, readdirSync, writeFileSync } from "fs"
import devs from "./devs.js"
import dotenv from "dotenv"
dotenv.config({ path: ".env.hyperbeam" })

export default class HyperBEAM {
  static OPERATOR = Symbol("operator")
  constructor({
    port = 10001,
    cu_port = 6363,
    as = [],
    bundler,
    gateway,
    wallet = ".wallet.json",
    reset,
    cwd = process.env.CWD ?? "./HyperBEAM",
    c,
    cmake,
    faff,
    simple_pay = false,
    simple_pay_price,
    bundler_ans104,
    bundler_httpsig,
    p4_non_chargable_routes,
    p4_lua,
    store_prefix,
    operator,
    logs = true,
    shell = true,
    devices,
    genesis_wasm = false,
    arweave_gateway,
  } = {}) {
    this.genesis_wasm = genesis_wasm
    this.cu_port = cu_port
    this.arweave_gateway = arweave_gateway || process.env.ARWEAVE_GATEWAY
    this.devices = devices
    this.p4_non_chargable_routes = p4_non_chargable_routes
    this.logs = logs
    this.cwd = cwd
    this.dirname = resolve(process.cwd(), this.cwd)
    this.wallet = wallet
    this.wallet_location = resolve(this.dirname, this.wallet)
    this.jwk = JSON.parse(this.file(this.wallet_location))
    this.addr = toAddr(this.jwk.n)
    if (reset) {
      for (let v of readdirSync(this.dirname)) {
        if (/^cache-/.test(v)) {
          try {
            rmSync(resolve(this.dirname, v), { recursive: true, force: true })
          } catch (e) {
            console.log(e)
          }
        }
      }
    }
    //this.cu = cu
    this.store_prefix = store_prefix
      ? "cache-mainnet-" + Math.floor(Math.random() * 10000000)
      : "cache-mainnet"
    this.p4_lua = p4_lua
    this.simple_pay = simple_pay
    this.spp = simple_pay_price
    this.operator = operator
    if (this.operator === HyperBEAM.OPERATOR) this.operator = this.addr
    this.faff = faff
    this.c = c
    this.cmake = cmake
    this.port = port
    this.url = `http://localhost:${this.port}`
    if (bundler) this.bundler = `http://localhost::${bundler}`
    this.bundler_ans104 = bundler_ans104
    if (bundler_httpsig) this.bundler = bundler_httpsig
    this.as = as
    this.gateway = gateway
    if (Array.isArray(this.faff)) {
      let i = 0
      for (let v of this.faff) {
        if (typeof v === "symbol" && v === HyperBEAM.OPERATOR) {
          this.faff[i] = this.addr
        }
        i++
      }
    }
    if (shell) this.shell()
  }
  shell() {
    const _as = this.as.length === 0 ? [] : ["as", this.as.join(",")]
    // Create environment without proxy variables to prevent Erlang httpc issues
    const cleanEnv = this.getCleanEnv()
    this._shell = spawn(
      "rebar3",
      [
        ..._as,
        "shell",
        "--eval",
        this.genEval({ gateway: this.gateway, wallet: this.wallet }),
      ],
      {
        env: cleanEnv,
        cwd: resolve(process.cwd(), this.cwd),
      }
    )
    if (this.logs) {
      this._shell.stdout.on("data", chunk => console.log(chunk.toString()))
      this._shell.stderr.on("data", err => console.error(err.toString()))
      this._shell.on("error", err =>
        console.error(`failed to start process: ${err}`)
      )
      this._shell.on("close", code => {
        console.log(`child process exited with code ${code}`)
        delete this._shell
      })
    }
  }
  file(path, type = "utf8") {
    return readFileSync(resolve(this.dirname, path), type)
  }
  eunit(module, test) {
    return new Promise(res => {
      let isTest = !isNil(test)
      if (Array.isArray(module)) {
        for (const v of module) {
          if (Array.isArray(v) || /:/.test(v)) {
            isTest = true
            break
          }
        }
      }
      const _as = this.as.length === 0 ? [] : ["as", this.as.join(",")]
      const _test = Array.isArray(test) ? test.join("+") : test
      let _module = ""

      if (Array.isArray(module)) {
        for (const v of module) {
          _module += _module === "" ? "" : ","
          if (Array.isArray(v)) _module += `${v[0]}:${v[1].join("+")}`
          else _module += v
        }
      } else {
        _module = test ? `${module}:${_test}` : module
      }

      const _arg = isTest ? "--test" : "--module"
      let params = [..._as, "eunit", _arg, _module]
      const _eunit = spawn("rebar3", params, {
        env: { ...process.env, ...this.genEnv() },
        cwd: resolve(process.cwd(), this.cwd),
      })
      if (this.logs) {
        _eunit.stdout.on("data", chunk => console.log(chunk.toString()))
        _eunit.stderr.on("data", err => console.error(err.toString()))
        _eunit.on("error", err =>
          console.error(`failed to start process: ${err}`)
        )
        _eunit.on("close", code => {
          console.log(`child process exited with code ${code}`)
          res()
        })
      }
    })
  }
  async ok() {
    try {
      const address = await fetch(`${this.url}/~meta@1.0/info/address`).then(
        r => r.text()
      )
      if (address) {
        if (this.logs) console.log("HyperBEAM ok(): initializing HB...")
        this.hb = await new HB({ url: this.url }).init(this.jwk)
        this._info = { address }
        if (this.logs) console.log("HyperBEAM ok(): SUCCESS!")
        return true
      } else return false
    } catch (e) {
      if (this.logs) console.error("HyperBEAM ok() error:", e.message)
      return false
    }
  }
  async ready(timeout = 60000) {
    // Start CU server if genesis_wasm is enabled
    if (this.genesis_wasm) {
      await this.startCU()
    }

    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        if (await this.ok()) {
          return this
        }
      } catch (e) {
        // Ignore errors, will retry
      }
      // Wait 1 second before next attempt
      await new Promise(r => setTimeout(r, 1000))
    }
    return false
  }

  // Start the genesis-wasm CU server
  async startCU() {
    const cuDir = resolve(this.dirname, "_build/genesis-wasm-server")
    const dbDir = resolve(this.dirname, "cache-mainnet/genesis-wasm")

    // Ensure DB directory exists
    spawnSync("mkdir", ["-p", dbDir])

    // Use arweave_gateway option or ARWEAVE_GATEWAY env var for proxy environments
    const gatewayUrl = this.arweave_gateway || process.env.GATEWAY_URL || "https://arweave.net"
    const graphqlUrl = process.env.GRAPHQL_URL || `${gatewayUrl}/graphql`

    // CU needs proxy for external services (arweave.net) but not for localhost
    // Keep all env vars but ensure NO_PROXY is set for localhost connections
    const env = {
      ...process.env,
      // Ensure NO_PROXY includes localhost for Node.js fetch
      NO_PROXY: 'localhost,127.0.0.1,::1',
      no_proxy: 'localhost,127.0.0.1,::1',
      UNIT_MODE: "hbu",
      HB_URL: `http://localhost:${this.port}`,
      NODE_CONFIG_ENV: "development",
      DB_URL: resolve(dbDir, "genesis-wasm-db"),
      PORT: String(this.cu_port),
      WALLET_FILE: this.wallet_location,
      DISABLE_PROCESS_FILE_CHECKPOINT_CREATION: "false",
      PROCESS_MEMORY_FILE_CHECKPOINTS_DIR: resolve(dbDir, "checkpoints"),
      GATEWAY_URL: gatewayUrl,
      ARWEAVE_URL: gatewayUrl,
      GRAPHQL_URL: graphqlUrl,
      GRAPHQL_URLS: graphqlUrl,
      CHECKPOINT_GRAPHQL_URL: graphqlUrl,
    }

    this.cuProc = spawn("node", ["--experimental-wasm-memory64", "-r", "dotenv/config", "src/app.js"], {
      cwd: cuDir,
      env,
      detached: true,
      stdio: this.logs ? ["ignore", "pipe", "pipe"] : "ignore"
    })

    this.cuProc.unref()

    if (this.logs) {
      console.log(`CU server starting on port ${this.cu_port}...`)
      if (this.cuProc.stdout) {
        this.cuProc.stdout.on("data", chunk => console.log(`[CU] ${chunk.toString().trim()}`))
      }
      if (this.cuProc.stderr) {
        this.cuProc.stderr.on("data", chunk => console.error(`[CU] ${chunk.toString().trim()}`))
      }
    }

    // Wait for CU to be ready - check / endpoint instead of /status
    const start = Date.now()
    while (Date.now() - start < 30000) {
      try {
        const res = await fetch(`http://localhost:${this.cu_port}/`)
        if (res.ok || res.status === 404) {
          // Any response (including 404) means server is up
          if (this.logs) console.log("CU server ready")
          return true
        }
      } catch (e) {
        // Not ready yet
      }
      await new Promise(r => setTimeout(r, 500))
    }
    if (this.logs) console.log("CU server startup timeout, continuing anyway...")
    return true // Continue anyway, the CU process is running
  }
  // Get clean environment without proxy variables for Erlang's httpc
  getCleanEnv() {
    const proxyKeys = [
      'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
      'YARN_HTTP_PROXY', 'YARN_HTTPS_PROXY',
      'GLOBAL_AGENT_HTTP_PROXY', 'GLOBAL_AGENT_HTTPS_PROXY'
    ]
    const cleanEnv = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!proxyKeys.includes(key)) {
        cleanEnv[key] = value
      }
    }
    // Add custom environment variables
    if (this.diagnostic) cleanEnv.DIAGNOSTIC = this.diagnostic
    if (this.c) {
      cleanEnv.CC = `gcc-${this.c}`
      cleanEnv.CXX = `g++-${this.c}`
    }
    if (this.cmake) cleanEnv.CMAKE_POLICY_VERSION_MINIMUM = this.cmake
    return cleanEnv
  }

  genEnv() {
    // Deprecated - use getCleanEnv() instead
    return this.getCleanEnv()
  }

  genEval({ gateway, wallet = ".wallet.json" }) {
    let _devices = ""
    let _devs = []
    if (this.devices) {
      for (const v of this.devices) {
        if (typeof v === "object") {
          _devs.push(
            `#{<<"name">> => <<"${v.name}">>, <<"module">> => ${v.module}}`
          )
        } else if (devs[v])
          _devs.push(
            `#{<<"name">> => <<"${devs[v].name}">>, <<"module">> => ${devs[v].module}}`
          )
      }
    }
    if (_devs.length > 0) {
      _devices = `, preloaded_devices => [${_devs.join(", ")}]`
    }
    const _wallet = `, priv_key_location => <<"${wallet}">>`
    const _gateway = gateway
      ? `, gateway => <<"http://localhost:${gateway}">>`
      : ""

    // store option will be overwritten by hb.erl
    const _store = this.store_prefix
      ? `, store => [#{ <<"store-module">> => hb_store_fs, <<"prefix">> => <<"${this.store_prefix}">> }, #{ <<"store-module">> => hb_store_gateway, <<"subindex">> => [#{ <<"name">> => <<"Data-Protocol">>, <<"value">> => <<"ao">> }], <<"store">> => [#{ <<"store-module">> => hb_store_fs, <<"prefix">> => <<"${this.store_prefix}">> }] }, #{ <<"store-module">> => hb_store_gateway, <<"store">> => [#{ <<"store-module">> => hb_store_fs, <<"prefix">> => <<"${this.store_prefix}">> }] }]`
      : ""
    let _bundler = this.bundler
      ? `, bundler_httpsig => <<"${this.bundler}">>`
      : ""
    let _bundler_ans104 =
      this.bundler_ans104 === false
        ? ", bundler_ans104 => false"
        : this.bundler_ans104
          ? `, bundler_ans104 => <<"http://localhost:${this.bundler_ans104}">>`
          : ""
    /*
    const _routes = `, routes => [#{ <<"template">> => <<"/result/.*">>, <<"node">> => #{ <<"prefix">> => <<"http://localhost:${this.cu}">> } }, #{ <<\"template\">> => <<\"/dry-run\">>, <<\"node\">> => #{ <<\"prefix\">> => <<\"http://localhost:${this.cu}\">> } }, #{ <<"template">> => <<"/graphql">>, <<"nodes">> => [#{ <<"prefix">> => <<"http://localhost:${gateway}">>, <<"opts">> => #{ http_client => httpc, protocol => http2 } }, #{ <<"prefix">> => <<"http://localhost:${gateway}">>, <<"opts">> => #{ http_client => gun, protocol => http2 } }] }, #{ <<"template">> => <<"/raw">>, <<"node">> => #{ <<"prefix">> => <<"http://localhost:${gateway}">>, <<"opts">> => #{ http_client => gun, protocol => http2 } } }]`
    */
    const _p4_non_chargable = this.p4_non_chargable
      ? `, p4_non_chargable_routes => [${this.p4_non_chargable_routes
          .map(() => `#{ <<"template">> => <<"/*~node-process@1.0/*">> }`)
          .join(", ")}]`
      : this.p4_lua
        ? `, p4_non_chargable_routes => [#{ <<"template">> => <<"/*~node-process@1.0/*">> }, #{ <<"template">> => <<"/~wao@1.0/*">> }, #{ <<"template">> => <<"/~p4@1.0/balance">> }, #{ <<"template">> => <<"/~meta@1.0/*">> }]`
        : !this.simple_pay
          ? ""
          : `, p4_non_chargable_routes => [#{ <<"template">> => <<"/~simple-pay@1.0/topup">> }, #{ <<"template">> => <<"/~meta@1.0/*">> }, #{ <<"template">> => <<"/~simple-pay@1.0/balance">> }]`

    const _operator = this.operator
      ? `, operator => <<"${this.operator}">>`
      : ""
    const _spp = this.spp ? `, simple_pay_price => ${this.spp}` : ""
    const _genesis_wasm_port = this.genesis_wasm ? `, genesis_wasm_port => ${this.cu_port}` : ""

    const _node_processes = this.p4_lua
      ? `, node_processes => #{ <<"ledger">> => #{ <<"device">> => <<"process@1.0">>, <<"execution-device">> => <<"lua@5.3a">>, <<"scheduler-device">> => <<"scheduler@1.0">>, <<"module">> => <<"${this.p4_lua.processor}">>, <<"operator">> => <<"${this.operator}">> } }`
      : ""
    const processor = this.p4_lua
      ? `#{ <<"device">> => <<"p4@1.0">>, <<"pricing-device">> => <<"simple-pay@1.0">>, <<"ledger-device">> => <<"lua@5.3a">>, <<"module">> => <<"${this.p4_lua.client}">>, <<"ledger-path">> => <<"/ledger~node-process@1.0">> }`
      : ""
    const _port = `port => ${this.port}`
    const _faff = isNil(this.faff)
      ? ""
      : `, faff_allow_list => [ ${map(addr => `<<"${addr}">>`)(this.faff).join(", ")} ]`

    const _on = this.p4_lua
      ? `, on => #{ <<"request">> => ${processor}, <<"response">> => ${processor} }`
      : this.simple_pay
        ? `, on => #{ <<"request">> => #{ <<"device">> => <<"p4@1.0">>, <<"pricing-device">> => <<"simple-pay@1.0">>, <<"ledger-device">> => <<"simple-pay@1.0">> }, <<"response">> => #{ <<"device">> => <<"p4@1.0">>, <<"pricing-device">> => <<"simple-pay@1.0">>, <<"ledger-device">> => <<"simple-pay@1.0">> } }`
        : !isNil(this.faff)
          ? `, on => #{ <<"request">> => #{ <<"device">> => <<"p4@1.0">>, <<"pricing-device">> => <<"faff@1.0">>, <<"ledger-device">> => <<"faff@1.0">> }, <<"response">> => #{ <<"device">> => <<"p4@1.0">>, <<"pricing-device">> => <<"faff@1.0">>, <<"ledger-device">> => <<"faff@1.0">> } }`
          : ""
    // Add cache_writers to allow the wallet to write to cache (needed for WASM module uploads)
    // Use the wallet address (this.addr) which is always available from the wallet file
    const _cache_writers = `, cache_writers => [<<"${this.addr}">>]`
    // Completely disable proxy for httpc with explicit no_proxy for localhost
    // This is needed because Erlang's httpc may not respect the NO_PROXY env var correctly
    const disableProxy = `inets:start(httpc, [{profile, default}]), httpc:set_options([{proxy, {{undefined, undefined}, ["localhost", "127.0.0.1", "::1"]}}]), `
    // Use gun instead of httpc for both relay and general http - gun doesn't have proxy issues
    const _http_client = `, http_client => gun, relay_http_client => gun`
    const start = `${disableProxy}hb:start_mainnet(#{ ${_port}${_gateway}${_wallet}${_faff}${_bundler}${_bundler_ans104}${_on}${_p4_non_chargable}${_operator}${_spp}${_genesis_wasm_port}${_devices}${_node_processes}${_cache_writers}${_http_client}, prometheus => false}).`
    return start
  }

  kill() {
    // Kill CU server if we started it
    if (this.cuProc && this.cuProc.pid) {
      try {
        process.kill(-this.cuProc.pid, "SIGKILL")
      } catch (e) {
        // Process may already be dead
      }
    }
    // Kill main HyperBEAM shell process
    if (this._shell) {
      this._shell.kill("SIGKILL")
    }
    // Also kill any remaining beam.smp processes on our port
    spawnSync("pkill", ["-9", "-f", `beam.smp.*${this.port}`], { stdio: "ignore" })
  }
}
