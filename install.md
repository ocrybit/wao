# HyperBEAM Quick Install

## v0.9-milestone-3-beta-1 (Pre-compiled, ~5 seconds)

```bash
cd ~
tar -xJf /path/to/wao/installation/asdf-erlang-rebar.tar.xz
tar -xJf /path/to/wao/installation/hyperbeam-v0.9-m3-b1-compiled.tar.xz
. ~/.asdf/asdf.sh
asdf global erlang 27.3.4.6
asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
```

Validate rebar3 is available:
```bash
rebar3 --version
# Expected: rebar 3.26.0 on Erlang/OTP 27 Erts 15.x
```

Validate HyperBEAM (11 tests):
```bash
cd ~/HyperBEAM-beta1 && rebar3 eunit --module=hb_path --sname test
```

### Files for beta-1
- `hyperbeam-v0.9-m3-b1-compiled.tar.xz` - Pre-compiled HyperBEAM beta-1 + WAMR + deps (38MB)
- `hyperbeam_rebar_beta1.config` - Patched rebar config for beta-1

---

## v0.9-milestone-3-beta-3

### Option 1: Pre-compiled (Fastest - ~5 seconds)

No system dependencies required - everything is pre-compiled including WAMR and dependencies.

```bash
cd ~
tar -xJf /path/to/wao/installation/asdf-erlang-rebar.tar.xz
tar -xJf /path/to/wao/installation/hyperbeam-v0.9-m3-b3-compiled.tar.xz
. ~/.asdf/asdf.sh
asdf global erlang 27.3.4.6
asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
```

Validate rebar3 is available:
```bash
rebar3 --version
# Expected: rebar 3.26.0 on Erlang/OTP 27 Erts 15.x
```

Validate HyperBEAM (11 tests, ~7 seconds first run):
```bash
cd ~/HyperBEAM && rebar3 eunit --module=hb_path --sname test
```

Optional: Run all tests
```bash
cd ~/HyperBEAM && rebar3 eunit --sname test
```

## Option 2: Fresh Install (~13 minutes)

### System Dependencies (requires root/sudo)
Skip if already installed:
```bash
apt-get update && apt-get install -y build-essential autoconf libssl-dev libncurses5-dev curl git cmake
```

### Prerequisites
```bash
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0 && . ~/.asdf/asdf.sh && asdf plugin add erlang && asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git && asdf install erlang 27.3.4.6 && asdf global erlang 27.3.4.6 && asdf install rebar 3.26.0 && asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
```

Validate rebar3 is available:
```bash
rebar3 --version
# Expected: rebar 3.26.0 on Erlang/OTP 27 Erts 15.x
```

### Install HyperBEAM
```bash
. ~/.asdf/asdf.sh
cd ~
git clone --depth 1 --branch v0.9-milestone-3-beta-3 https://github.com/permaweb/HyperBEAM.git
cd HyperBEAM
cp /path/to/wao/installation/hyperbeam_rebar.config rebar.config
rm -f rebar.lock
rebar3 compile
```

Optional: Run tests
```bash
rebar3 eunit --sname test
```

## Test Report (January 12, 2026)
| Status | Count | Notes |
|--------|-------|-------|
| Passed | 106 | Core functionality works |
| Failed | 35 | HTTP/cron/integration tests |

Failures are HTTP server initialization, cron timing, and external integration issues in sandboxed test environments. Core functionality (bundles, paths, wallets, codecs, WASM execution) works correctly.

## Files (in `installation/` folder)
- `hyperbeam_rebar.config` - Patched config with git-only deps (bypasses hex.pm)
- `hyperbeam-v0.9-m3-b3-compiled.tar.xz` - Pre-compiled HyperBEAM + WAMR + deps (26MB)
- `asdf-erlang-rebar.tar.xz` - Pre-compiled Erlang 27.3.4.6 + rebar3 (23MB)

---

## Running hbsig Tests (with wao devices)

The hbsig tests require the HyperBEAM **wao branch** which includes additional devices like `dev_hbsig.erl`.

### Setup HyperBEAM with wao devices

1. **Initialize the HyperBEAM submodule** (wao branch):
```bash
cd /path/to/wao
git submodule update --init --recursive
```

2. **Copy the patched rebar config** (for offline compilation):
```bash
cd HyperBEAM
cp ../installation/hyperbeam_rebar.config rebar.config
rm -f rebar.lock
```

3. **Create or copy a wallet file**:
```bash
# Option A: Copy from beta-1 installation
cp ~/HyperBEAM-beta1/.wallet.json .wallet.json

# Option B: Generate new wallet (requires arweave tools)
# The wallet file should be a JSON JWK format
```

4. **Compile HyperBEAM**:
```bash
. ~/.asdf/asdf.sh
rebar3 compile
```

### Running hbsig Tests

```bash
cd /path/to/wao/hbsig
npm install
npm link wao  # Link the parent wao package

# Run tests with CWD pointing to HyperBEAM
CWD=/path/to/wao/HyperBEAM npm run test
```

### Starting HyperBEAM (Non-blocking)

The `src/hyperbeam.js` uses `erl -detached` for non-blocking operation:

```bash
# Start HyperBEAM in detached mode (returns immediately)
cd /path/to/HyperBEAM
. ~/.asdf/asdf.sh
erl -pa _build/default/lib/*/ebin -detached -eval "hb:start_mainnet(#{port => 10001, priv_key_location => <<\".wallet.json\">>})."

# Verify it's running
curl http://localhost:10001/~meta@1.0/info/address

# Kill HyperBEAM
pkill -9 -f beam.smp
pkill -9 -f epmd
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CWD` | Path to HyperBEAM directory | `./HyperBEAM` |

### Troubleshooting

**Tests hang forever**: The old `rebar3 shell` approach blocks. Use `erl -detached` instead.

**Socket errors during tests**: HyperBEAM may not be fully initialized. The `ready()` function waits up to 60s with polling.

**Missing devices (hbsig@1.0 not found)**: Use the HyperBEAM submodule (wao branch), not the standard release.

## Running Legacynet Tests

### Prerequisites

1. **Clone arjson** (specific version required):
```bash
cd /home/user
git clone https://github.com/weavedb/arjson.git
cd arjson
git checkout 62adab7  # Version with Parser, decode, Bundle exports
cd sdk && npm install
```

2. **Download TinyLlama model** (for LLM tests):
```bash
cd /path/to/wao
curl -L -o tinyllama.gguf "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q2_K.gguf"
```

### Running Tests

```bash
# Start the wao server in background (provides AR/MU/SU/CU endpoints)
node --experimental-wasm-memory64 src/run.js --memory --port 4000 &

# Run legacynet tests
npm run test -- test/legacynet/*.test.js

# Kill server when done
pkill -f "src/run.js"
```

### Notes

- The server starts AR on port 4000, BD on 4001, MU on 4002, SU on 4003, CU on 4004
- arjson must be at commit `62adab7` - newer versions removed `Parser` and `decode` exports
- TinyLlama model (~460MB) is required for LLM tests

## Genesis-WASM Setup (for HyperBEAM genesis-wasm@1.0 device)

The genesis-wasm device enables HyperBEAM to execute AO processes using an external Compute Unit (CU) server. This is required for running genesis-wasm tests.

### Prerequisites

- Node.js 22+ installed
- HyperBEAM compiled with `genesis_wasm` profile

### Option 1: Pre-compiled (Fastest)

```bash
cd ~/HyperBEAM
tar -xJf /path/to/wao/installation/genesis-wasm-server-precompiled.tar.xz -C _build/
```

The precompiled archive includes:
- CU server source code
- All npm dependencies (`node_modules`)
- Patched healthcheck routes for HyperBEAM compatibility

### Option 2: Fresh Setup

```bash
cd ~/HyperBEAM
make setup-genesis-wasm
```

This will:
1. Clone the CU server from `permaweb/ao` repo
2. Run `npm install` to install dependencies
3. Apply the healthcheck patch for HyperBEAM compatibility

### Compile HyperBEAM with genesis_wasm Profile

```bash
cd ~/HyperBEAM
rebar3 as genesis_wasm compile
```

### Running Genesis-WASM Tests

```bash
cd /path/to/wao
npm run test -- test/hyperbeam/hb-success/upload.test.js
```

The test will automatically:
1. Start the CU server on port 6363
2. Start HyperBEAM with genesis-wasm device enabled
3. Execute AO process evaluation via the CU

### Files (in `installation/` folder)

- `genesis-wasm-server-precompiled.tar.xz` - Pre-compiled CU server with dependencies (~8MB)

### Troubleshooting

**CU health check fails (socket_closed_remotely)**: The CU server may not have started. Check that port 6363 is available and Node.js is installed.

**genesis-wasm device not found**: Ensure HyperBEAM was compiled with `rebar3 as genesis_wasm compile` (not just `rebar3 compile`).

### Using genesis_wasm Option in Tests

The `HyperBEAM` class supports automatic CU server management via the `genesis_wasm` option:

```javascript
import HyperBEAM from "wao/hyperbeam"

// Automatically starts CU server on port 6363
const hbeam = await new HyperBEAM({
  reset: true,
  genesis_wasm: true,
  cu_port: 6363  // optional, defaults to 6363
}).ready()

// CU server is automatically killed when HyperBEAM is killed
await hbeam.kill()
```

### HTTPS Proxy Support

HyperBEAM automatically configures the Erlang httpc client to use the `HTTPS_PROXY` environment variable if set. This enables HyperBEAM to fetch data from Arweave in proxy-required environments.

```bash
# Set proxy before running tests
export HTTPS_PROXY="http://proxy-host:port"
npm run test -- test/hyperbeam/hb-success/upload.test.js
```

