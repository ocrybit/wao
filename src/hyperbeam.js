import { spawn, spawnSync } from "child_process"
import { resolve } from "path"
import { isNil, map } from "ramda"
import { toAddr } from "./test.js"
import HB from "./hb.js"
import { rmSync, readFileSync, readdirSync, writeFileSync } from "fs"
import devs from "./devs.js"
import dotenv from "dotenv"
dotenv.config({ path: ".env.hyperbeam" })

// HyperBEAM version paths
const HB_PATHS = {
  beta1: "/root/HyperBEAM-beta1",
  beta3: "/root/HyperBEAM",
}

// Get default CWD based on HB_VERSION (default: beta3)
function getDefaultCwd() {
  const version = process.env.HB_VERSION || "beta3"
  return process.env.CWD || HB_PATHS[version] || HB_PATHS.beta3
}

export default class HyperBEAM {
  static OPERATOR = Symbol("operator")
  constructor({
    port = 10001,
    cu_port = 6363, // Must match route in hb_opts.erl which hardcodes localhost:6363
    as = [],
    bundler,
    gateway,
    wallet = ".wallet.json",
    reset,
    cwd = getDefaultCwd(),
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
    arweave_gateway, // Remote Arweave gateway URL (e.g., "https://g8way.io") for proxy environments
    rebar3, // Use original rebar3 shell (true) or direct erl mode (false). Default: true, can be overridden by HB_REBAR3 env var
  } = {}) {
    this.arweave_gateway = arweave_gateway || process.env.ARWEAVE_GATEWAY
    // Determine rebar3 mode: option > env var > default (true)
    const envRebar3 = process.env.HB_REBAR3
    if (rebar3 !== undefined) {
      this.rebar3 = rebar3
    } else if (envRebar3 !== undefined) {
      this.rebar3 = envRebar3.toLowerCase() !== "false"
    } else {
      this.rebar3 = true // default to rebar3 mode
    }
    this.genesis_wasm = genesis_wasm
    this.cu_port = cu_port
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
      // Kill any existing HyperBEAM processes first
      spawnSync("pkill", ["-9", "-f", "beam.smp"], { stdio: "ignore" })
      spawnSync("pkill", ["-9", "-f", "epmd"], { stdio: "ignore" })
      // Wait for port to be freed
      spawnSync("sleep", ["1"])

      // Use bash rm -rf for more reliable cache clearing
      for (let v of readdirSync(this.dirname)) {
        if (/^cache-/.test(v)) {
          try {
            spawnSync("rm", ["-rf", resolve(this.dirname, v)], { stdio: "ignore" })
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
    // Use erl with spawn to keep the process as a managed child
    const evalCmd = this.genEval({ gateway: this.gateway, wallet: this.wallet })
    // Remove trailing period and add receive to keep VM alive
    const evalWithSleep = evalCmd.replace(/\.$/, ", receive after infinity -> ok end.")

    // Write eval command to a temp file to avoid shell escaping issues
    const evalFile = resolve(this.dirname, ".hb_eval_cmd")
    writeFileSync(evalFile, evalWithSleep)

    // Remove any existing crash dump
    spawnSync("rm", ["-f", resolve(this.dirname, "erl_crash.dump")], { stdio: "ignore" })

    let cmd
    if (this.rebar3) {
      // Rebar3 mode (default/original) - use rebar3 shell command
      const evalForRebar3 = evalCmd.replace(/\.$/, ".")
      cmd = `. $HOME/.asdf/asdf.sh && rebar3 shell --eval '${evalForRebar3}'`
    } else {
      // Direct erl mode - use erl with rebar3-compiled beam files
      // Beta1's prometheus_cowboy uses prometheus_buckets:exponential/3 which doesn't exist.
      // We manually register the required cowboy metrics with linear buckets instead.
      // Beta3 doesn't include prometheus, so wrap in try-catch to handle gracefully.
      const cowboyMetricsSetup = `
        try
          application:ensure_all_started(prometheus),
          prometheus_counter:declare([{name, cowboy_early_errors_total}, {labels, [method, reason]}, {help, <<"">>}]),
          prometheus_counter:declare([{name, cowboy_protocol_upgrades_total}, {labels, [method, status, status_class]}, {help, <<"">>}]),
          prometheus_counter:declare([{name, cowboy_requests_total}, {labels, [method, reason, status_class]}, {help, <<"">>}]),
          prometheus_counter:declare([{name, cowboy_spawned_processes_total}, {labels, [method, reason, status_class]}, {help, <<"">>}]),
          prometheus_counter:declare([{name, cowboy_errors_total}, {labels, [method, reason, error]}, {help, <<"">>}]),
          Buckets = [0, 100, 1000, 10000, 100000, 1000000, 10000000],
          prometheus_histogram:declare([{name, cowboy_receive_body_duration_seconds}, {labels, [method, reason, status_class]}, {buckets, [0.01, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 10.0]}, {help, <<"">>}]),
          prometheus_histogram:declare([{name, cowboy_request_duration_seconds}, {labels, [method, reason, status_class]}, {buckets, [0.01, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 10.0]}, {help, <<"">>}]),
          prometheus_histogram:declare([{name, cowboy_request_body_size_bytes}, {labels, [method, reason, status_class]}, {buckets, Buckets}, {help, <<"">>}]),
          prometheus_histogram:declare([{name, cowboy_response_body_size_bytes}, {labels, [method, reason, status_class]}, {buckets, Buckets}, {help, <<"">>}])
        catch _:_ -> ok end,
        timer:sleep(100)
      `.replace(/\n\s*/g, ' ')
      const prometheusSetup = cowboyMetricsSetup
      // Parse proxy URL and extract host, port, and optional userinfo (username:password) for authentication
      // Note: uri_string:parse may return strings or binaries depending on Erlang version, so we handle both
      const toList = `fun(B) when is_binary(B) -> binary_to_list(B); (L) when is_list(L) -> L end`
      const proxySetup = `${prometheusSetup}, case os:getenv("HTTPS_PROXY") of false -> case os:getenv("https_proxy") of false -> ok; P -> (fun(U) -> ToList = ${toList}, case uri_string:parse(U) of #{host := H, port := Pt} = M -> inets:start(), ProxyOpts = [{proxy, {{ToList(H), Pt}, ["localhost", "127.0.0.1"]}}], AuthOpts = case maps:get(userinfo, M, undefined) of undefined -> []; UI -> case string:split(ToList(UI), ":") of [User, Pass] -> [{proxy_auth, {User, Pass}}]; _ -> [] end end, httpc:set_options(ProxyOpts ++ AuthOpts); _ -> ok end end)(P) end; P -> (fun(U) -> ToList = ${toList}, case uri_string:parse(U) of #{host := H, port := Pt} = M -> inets:start(), ProxyOpts = [{proxy, {{ToList(H), Pt}, ["localhost", "127.0.0.1"]}}], AuthOpts = case maps:get(userinfo, M, undefined) of undefined -> []; UI -> case string:split(ToList(UI), ":") of [User, Pass] -> [{proxy_auth, {User, Pass}}]; _ -> [] end end, httpc:set_options(ProxyOpts ++ AuthOpts); _ -> ok end end)(P) end`

      // Use default profile beam files
      cmd = `. $HOME/.asdf/asdf.sh && erl -pa _build/default/lib/*/ebin -noshell -eval '${proxySetup}' -eval "$(cat ${evalFile})"`
    }

    this.proc = spawn("bash", ["-c", cmd], {
      env: { ...process.env, ...this.genEnv() },
      cwd: resolve(process.cwd(), this.cwd),
      detached: true,
      stdio: this.logs ? ["ignore", "pipe", "pipe"] : "ignore"
    })

    // Don't let parent wait for this child
    this.proc.unref()

    if (this.logs && this.proc.stdout) {
      this.proc.stdout.on("data", chunk => console.log(chunk.toString()))
      this.proc.stderr.on("data", chunk => console.error(chunk.toString()))
    }

    if (this.logs) {
      console.log(`HyperBEAM starting on port ${this.port} (rebar3=${this.rebar3})...`)
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
        this.hb = await new HB({ url: this.url }).init(this.jwk)
        return true
      } else return false
    } catch (e) {
      return false
    }
  }
  async ready(timeout = 60000) {
    // Start CU server if genesis_wasm is enabled
    if (this.genesis_wasm) {
      await this.startCU()
    }

    // Wait a bit for HyperBEAM to initialize before polling
    await new Promise(r => setTimeout(r, 3000))

    const start = Date.now()
    return new Promise(res => {
      const to = setInterval(async () => {
        try {
          if (Date.now() - start > timeout) {
            clearInterval(to)
            res(false)
          } else {
            if (await this.ok()) {
              // Wait a bit more after first successful response
              await new Promise(r => setTimeout(r, 1000))
              clearInterval(to)
              res(this)
            }
          }
        } catch (e) {}
      }, 1000)
    })
  }

  // Start the genesis-wasm CU server
  async startCU() {
    const cuDir = resolve(this.dirname, "_build/genesis-wasm-server")
    const dbDir = resolve(this.dirname, "cache-mainnet/genesis-wasm")

    // Ensure DB directory exists
    spawnSync("mkdir", ["-p", dbDir])

    // Use arweave_gateway option or ARWEAVE_GATEWAY env var for proxy environments
    // Default to arweave.net, but g8way.io works better through some proxies
    const gatewayUrl = this.arweave_gateway || process.env.GATEWAY_URL || "https://arweave.net"
    const graphqlUrl = process.env.GRAPHQL_URL || `${gatewayUrl}/graphql`

    const env = {
      ...process.env,
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
      GRAPHQL_URLS: graphqlUrl,  // Only use proxied URL, no direct goldsky fallback
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

    // Wait for CU to be ready
    const start = Date.now()
    while (Date.now() - start < 30000) {
      try {
        const res = await fetch(`http://localhost:${this.cu_port}/status`)
        if (res.ok) {
          if (this.logs) console.log("CU server ready")
          return true
        }
      } catch (e) {
        // Not ready yet
      }
      await new Promise(r => setTimeout(r, 500))
    }
    console.error("CU server failed to start within 30 seconds")
    return false
  }
  genEnv() {
    let _env = {}
    if (this.diagnostic) _env.DIAGNOSTIC = this.diagnostic
    if (this.c) {
      _env.CC = `gcc-${this.c}`
      _env.CXX = `g++-${this.c}`
    }
    if (this.cmake) _env.CMAKE_POLICY_VERSION_MINIMUM = this.cmake
    return _env
  }

  genEval({ gateway, wallet = ".wallet.json" }) {
    let _devices = ""
    if (this.devices) {
      let _devs = []
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
      _devices = `, preloaded_devices => [${_devs.join(", ")}]`
    }
    const _wallet = `, priv_key_location => <<"${wallet}">>`
    // Local gateway port takes precedence, then remote arweave_gateway URL
    const _gateway = gateway
      ? `, gateway => <<"http://localhost:${gateway}">>`
      : this.arweave_gateway
        ? `, gateway => <<"${this.arweave_gateway}">>`
        : ""

    // store option will be overwritten by hb.erl
    const _store = this.store_prefix
      ? `, store => [#{ <<"store-module">> => hb_store_fs, <<"prefix">> => <<"${this.store_prefix}">> }, #{ <<"store-module">> => hb_store_gateway, <<"subindex">> => [#{ <<"name">> => <<"Data-Protocol">>, <<"value">> => <<"ao">> }], <<"store">> => [#{ <<"store-module">> => hb_store_fs, <<"prefix">> => <<"${this.store_prefix}">> }] }, #{ <<"store-module">> => hb_store_gateway, <<"store">> => [#{ <<"store-module">> => hb_store_fs, <<"prefix">> => <<"${this.store_prefix}">> }] }]`
      : ""
    let _bundler = this.bundler
      ? `, bundler_httpsig => <<"${this.bundler}">>`
      : ""
    // Don't pass bundler_ans104 if false - Erlang code can't handle boolean false
    // Only pass it when it's a truthy value (port number or URL)
    let _bundler_ans104 = this.bundler_ans104 && this.bundler_ans104 !== false
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
    const start = `hb:start_mainnet(#{ ${_port}${_gateway}${_wallet}${_faff}${_bundler}${_bundler_ans104}${_on}${_p4_non_chargable}${_operator}${_spp}${_genesis_wasm_port}${_devices}${_node_processes}}).`
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
    // Kill our process group if we have a reference
    if (this.proc && this.proc.pid) {
      try {
        process.kill(-this.proc.pid, "SIGKILL")
      } catch (e) {
        // Process may already be dead
      }
    }
    // Also kill any remaining beam.smp processes on our port
    spawnSync("pkill", ["-9", "-f", `beam.smp.*${this.port}`])
    // Fallback: kill all beam.smp processes
    spawnSync("pkill", ["-9", "-f", "beam.smp"])
  }
}
