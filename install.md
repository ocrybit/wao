# WAO + HyperBEAM Beta1 Installation Guide

## Quick Start (TL;DR)

```bash
# 1. Extract pre-compiled Erlang and HyperBEAM
cd ~
tar -xJf /path/to/wao/installation/asdf-erlang-rebar.tar.xz
tar -xJf /path/to/wao/installation/hyperbeam-v0.9-m3-b1-compiled.tar.xz
. ~/.asdf/asdf.sh
asdf global erlang 27.3.4.6
asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc

# 2. Set required environment variables (MANDATORY)
export ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev"
export GATEWAY_URL="https://arweave-proxy.ocrybit.workers.dev"
export HB_REBAR3=false
echo 'export ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev"' >> ~/.bashrc
echo 'export GATEWAY_URL="https://arweave-proxy.ocrybit.workers.dev"' >> ~/.bashrc
echo 'export HB_REBAR3=false' >> ~/.bashrc

# 3. Install WAO dependencies and build hbsig
cd /path/to/wao
npm install
cd hbsig && yarn install && yarn build && cd ..
npm install  # Re-install to link local hbsig

# 4. Create .env.hyperbeam file (MANDATORY for tests)
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
GATEWAY_URL=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# 5. Run tests
node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/simple.test.js
```

---

## Prerequisites

### System Dependencies (requires root/sudo)

```bash
apt-get update && apt-get install -y build-essential autoconf libssl-dev libncurses5-dev curl git cmake
```

### Node.js

Node.js 22+ is required for WASM memory64 support:

```bash
node --version  # Should be v22.x or higher
```

---

## Step 1: Install Erlang and Rebar3

### Option A: Pre-compiled (Recommended, ~5 seconds)

```bash
cd ~
tar -xJf /path/to/wao/installation/asdf-erlang-rebar.tar.xz
. ~/.asdf/asdf.sh
asdf global erlang 27.3.4.6
asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
```

### Option B: Fresh Install (~13 minutes)

```bash
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0
. ~/.asdf/asdf.sh
asdf plugin add erlang
asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git
asdf install erlang 27.3.4.6
asdf global erlang 27.3.4.6
asdf install rebar 3.26.0
asdf global rebar 3.26.0
echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
```

### Verify Installation

```bash
rebar3 --version
# Expected: rebar 3.26.0 on Erlang/OTP 27 Erts 15.x
```

---

## Step 2: Install HyperBEAM Beta1

### Option A: Pre-compiled (Recommended, ~5 seconds)

```bash
cd ~
tar -xJf /path/to/wao/installation/hyperbeam-v0.9-m3-b1-compiled.tar.xz
```

### Option B: Fresh Build

```bash
cd ~
git clone --depth 1 --branch v0.9-milestone-3-beta-1 https://github.com/permaweb/HyperBEAM.git HyperBEAM-beta1
cd HyperBEAM-beta1
cp /path/to/wao/installation/hyperbeam_rebar_beta1.config rebar.config
rm -f rebar.lock
. ~/.asdf/asdf.sh
rebar3 compile
```

### Verify HyperBEAM

```bash
cd ~/HyperBEAM-beta1 && rebar3 eunit --module=hb_path --sname test
# Should pass 11 tests
```

---

## Step 2b: Install HyperBEAM WAO Branch (Alternative)

The WAO branch from weavedb/HyperBEAM includes additional devices and fixes that make more tests pass. **Recommended for full WAO compatibility.**

### Clone and Build WAO Branch

```bash
cd ~
git clone --depth 1 --branch wao https://github.com/weavedb/HyperBEAM.git HyperBEAM-wao
cd HyperBEAM-wao

# Copy rebar.config and _build from beta1 for offline compilation
cp ~/HyperBEAM-beta1/rebar.config .
cp -r ~/HyperBEAM-beta1/_build .
rm -f rebar.lock

# Compile
. ~/.asdf/asdf.sh
rebar3 compile
```

### Configure .env.hyperbeam to Use WAO Branch

Update your `.env.hyperbeam` to point to the wao branch:

```bash
cd /path/to/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
GATEWAY_URL=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
CWD=/root/HyperBEAM-wao
EOF
```

### Key Differences: Beta1 vs WAO Branch

| Feature | Beta1 | WAO Branch |
|---------|-------|------------|
| hbsig prefix | `sig-` | `http-sig-` |
| wao@1.0 device | Manual setup required | Included |
| patch@1.0 tests | Partial | Full support |
| p4 payment tests | Fails | Passes |

**Important**: When using the WAO branch, ensure hbsig uses `http-sig-` prefix (default in the repo).

---

## Step 3: Install WAO Dependencies (MANDATORY)

### Install npm Dependencies

```bash
cd /path/to/wao
npm install
```

### Build Local hbsig Package (MANDATORY)

The local hbsig package MUST be built before running tests. The WAO branch of HyperBEAM uses `http-sig-` prefix (the default in hbsig).

```bash
cd /path/to/wao/hbsig
yarn install
yarn build
cd /path/to/wao
npm install  # Re-install to link local hbsig/dist
```

**Why this is mandatory**: The `package.json` references `"hbsig": "file:./hbsig/dist"` which requires the local build. Without it, tests will fail with signature errors.

### Verify hbsig Build

```bash
ls /path/to/wao/hbsig/dist/esm/index.js
# Should exist
```

---

## Step 4: Configure Environment

### Set Environment Variables (MANDATORY)

These environment variables MUST be set for tests to work correctly.

```bash
# Set for current session
export ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev"
export GATEWAY_URL="https://arweave-proxy.ocrybit.workers.dev"
export HB_REBAR3=false

# Persist to bashrc for future sessions
echo 'export ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev"' >> ~/.bashrc
echo 'export GATEWAY_URL="https://arweave-proxy.ocrybit.workers.dev"' >> ~/.bashrc
echo 'export HB_REBAR3=false' >> ~/.bashrc
```

### Create .env.hyperbeam File (MANDATORY)

The test suite loads environment variables from `.env.hyperbeam` via dotenv. This file MUST exist in the wao directory:

```bash
cd /path/to/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
GATEWAY_URL=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF
```

**Why this is mandatory**: The HyperBEAM class uses `dotenv.config({ path: ".env.hyperbeam" })` to load configuration. Without this file, `HB_REBAR3` defaults to `true` which causes tests to hang indefinitely.

### Create/Copy Wallet File

```bash
# Copy from existing HyperBEAM installation
cp ~/HyperBEAM-beta1/.wallet.json /path/to/wao/.wallet.json

# Or ensure one exists in HyperBEAM directory
ls ~/HyperBEAM-beta1/.wallet.json
```

### Optional Environment Variables

```bash
# HyperBEAM installation path (defaults to ~/HyperBEAM-beta1)
export CWD=~/HyperBEAM-beta1
```

---

## Step 5: Running Tests

### Prerequisites

Ensure environment variables are set (see Step 4). If you followed the installation, they should already be in your `.bashrc`.

```bash
# Verify environment variables are set
echo $ARWEAVE_GATEWAY  # Should be: https://arweave-proxy.ocrybit.workers.dev
echo $HB_REBAR3        # Should be: false
```

### Test Organization

Tests are organized into categories based on their requirements:

| Directory | Description | Requirements |
|-----------|-------------|--------------|
| `hb-success/` | Tests that pass with standard setup | Basic HyperBEAM + wao@1.0 device |
| `hb-genesis/` | Tests requiring genesis-wasm | CU server + genesis-wasm device |
| `hb-fail/` | Tests with known failures | Various issues |
| `hb-hang/` | Tests with known hang issues | Missing scripts or timing issues |
| `hb-tutorials/` | Tutorial-based tests | May require additional setup |

### Run Simple Test

```bash
node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/simple.test.js
```

### Run All hb-success Tests

```bash
node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/*.test.js
```

### Run Specific Test File

```bash
node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/meta.test.js
```

### Run Genesis-WASM Tests

Tests in `hb-genesis/` require the CU server to be running. These tests use `genesis_wasm: true` in the HyperBEAM constructor which auto-starts the CU server:

```bash
node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-genesis/upload.test.js
```

### Background Test Technique (MANDATORY for Unknown Tests)

**Always use this technique when running unfamiliar tests.** Many tests can hang indefinitely, blocking your terminal:

```bash
# 1. Run test in background
npm test -- --test-name-pattern="." test/hyperbeam/hb-hang/some.test.js > /tmp/test.log 2>&1 &
TEST_PID=$!
echo "Test running with PID: $TEST_PID"

# 2. Monitor the log in another terminal (or same terminal)
tail -f /tmp/test.log

# 3. Check if test completed
tail -50 /tmp/test.log | grep -E "(pass|fail|duration_ms)"

# 4. Kill hung test if needed (no output for >60s usually means hung)
kill $TEST_PID
pkill -9 -f beam.smp  # Clean up HyperBEAM processes
```

**Quick one-liner to run and wait with timeout:**

```bash
timeout 120 npm test -- --test-name-pattern="." test/hyperbeam/hb-success/simple.test.js
```

**Signs a test is hung:**
- CU stats keep printing every 10s with no progress
- No new "sent, status:" messages from HyperBEAM
- Test duration exceeds 60s with no subtest results

### Test Command Flags Explained

| Flag | Purpose |
|------|---------|
| `ARWEAVE_GATEWAY` | Arweave proxy URL (MANDATORY - ensures network compatibility) |
| `HB_REBAR3=false` | Use direct erl mode (MANDATORY - rebar3 mode hangs) |
| `--experimental-wasm-memory64` | Enable WASM memory64 for AO processes |
| `--test` | Run Node.js test runner |
| `--test-concurrency=1` | Run tests sequentially (required for HyperBEAM) |

---

## Proxy / Restricted Network Configuration

### Cloudflare Workers Arweave Proxy

The `ARWEAVE_GATEWAY` is mandatory for all test commands. In code, you can also set it programmatically:

```javascript
new HyperBEAM({ arweave_gateway: "https://arweave-proxy.ocrybit.workers.dev" })
```

---

## Troubleshooting

### Tests Hang Forever

**Cause 1**: Using rebar3 mode (default) which blocks indefinitely.

**Solution**: Ensure `HB_REBAR3=false` is set:
```bash
export HB_REBAR3=false
echo 'export HB_REBAR3=false' >> ~/.bashrc
```

**Cause 2**: Using a device (like `wao@1.0`) that is not registered in HyperBEAM's preloaded_devices.

**Solution**: Add the device to `hb_opts.erl` preloaded_devices list and recompile:
```bash
cd ~/HyperBEAM-beta1
# Check if wao@1.0 is registered
grep "wao@1.0" src/hb_opts.erl
# If not found, add it (see "Advanced: WAO Device Setup" section)
```

**Cause 3**: Tests requiring genesis-wasm when CU server isn't running.

**Solution**: Use tests that pass `genesis_wasm: true` to auto-start CU server, or manually start CU:
```bash
cd ~/HyperBEAM-beta1/_build/genesis-wasm-server
GATEWAY_URL=https://arweave-proxy.ocrybit.workers.dev npm run dev
```

### "400: Unauthorized" on POST Requests

**Cause**: hbsig signature prefix mismatch. Beta1 requires `sig-` prefix.

**Solution**: Rebuild hbsig with the correct prefix:
```bash
cd /path/to/wao/hbsig
yarn build
cd /path/to/wao
npm install
```

The hbsig source files have been patched to use `sig-` prefix. If you see this error, ensure you're using the local hbsig build.

### "Cannot find module 'hbsig'"

**Cause**: Local hbsig not built or not linked.

**Solution**:
```bash
cd /path/to/wao/hbsig
yarn install
yarn build
cd /path/to/wao
npm install
```

### Port Conflicts

HyperBEAM uses port 10001 by default. Kill lingering processes:
```bash
pkill -9 -f beam.smp
pkill -9 -f epmd
```

### Prometheus Errors

Prometheus errors during startup are caught gracefully. Tests will still run. To eliminate these errors:
```bash
cd ~/HyperBEAM-beta1
rebar3 as test compile
```

---

## Environment Variables Reference

| Variable | Description | Required Value |
|----------|-------------|----------------|
| `ARWEAVE_GATEWAY` | Arweave proxy URL for HyperBEAM | `https://arweave-proxy.ocrybit.workers.dev` (MANDATORY) |
| `GATEWAY_URL` | Arweave proxy URL for CU server | `https://arweave-proxy.ocrybit.workers.dev` (MANDATORY for genesis-wasm) |
| `HB_REBAR3` | Use rebar3 mode | `false` (MANDATORY - rebar3 mode hangs) |
| `CWD` | HyperBEAM installation directory | `~/HyperBEAM-beta1` (optional) |

---

## Installation Files Reference

Located in `installation/` folder:

| File | Description | Size |
|------|-------------|------|
| `asdf-erlang-rebar.tar.xz` | Pre-compiled Erlang 27.3.4.6 + rebar3 | ~23MB |
| `hyperbeam-v0.9-m3-b1-compiled.tar.xz` | Pre-compiled HyperBEAM beta1 | ~38MB |
| `hyperbeam_rebar_beta1.config` | Patched rebar config for beta1 | - |

---

## Complete Installation Checklist

- [ ] System dependencies installed (build-essential, autoconf, libssl-dev, etc.)
- [ ] Node.js 22+ installed
- [ ] Erlang 27.3.4.6 installed via asdf
- [ ] rebar3 3.26.0 installed via asdf
- [ ] HyperBEAM beta1 extracted to `~/HyperBEAM-beta1`
- [ ] WAO npm dependencies installed (`npm install`)
- [ ] hbsig built locally (`cd hbsig && yarn install && yarn build`)
- [ ] WAO re-installed to link hbsig (`npm install`)
- [ ] Environment variables exported to `~/.bashrc`:
  - [ ] `ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev"`
  - [ ] `GATEWAY_URL="https://arweave-proxy.ocrybit.workers.dev"`
  - [ ] `HB_REBAR3=false`
- [ ] Wallet file exists (`~/HyperBEAM-beta1/.wallet.json`)

---

## Advanced: Genesis-WASM Setup

For tests requiring genesis-wasm device:

### Pre-compiled (Recommended)

```bash
cd ~/HyperBEAM-beta1
tar -xJf /path/to/wao/installation/genesis-wasm-server-precompiled.tar.xz -C _build/
rebar3 as genesis_wasm compile
```

### Running Genesis-WASM Tests

```bash
node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/upload.test.js
```

---

## Advanced: WAO Device Setup

The `wao@1.0` device is not included in the official HyperBEAM beta1 release. To enable tests that use this device, you need BOTH the module file AND device registration:

### Step 1: Install dev_wao.erl Module

```bash
cd ~/HyperBEAM-beta1
curl -s https://raw.githubusercontent.com/weavedb/HyperBEAM/wao/src/dev_wao.erl -o src/dev_wao.erl
```

### Step 2: Register wao@1.0 in preloaded_devices

Add the wao@1.0 device to `src/hb_opts.erl` preloaded_devices list:

```erlang
% In the preloaded_devices list, add before wasi@1.0:
#{<<"name">> => <<"wao@1.0">>, <<"module">> => dev_wao},
```

Or apply the patch:

```bash
cd ~/HyperBEAM-beta1
sed -i 's/#{<<"name">> => <<"wasi@1.0">>/#{<<"name">> => <<"wao@1.0">>, <<"module">> => dev_wao},\n            #{<<"name">> => <<"wasi@1.0">>/' src/hb_opts.erl
```

### Step 3: Recompile

```bash
cd ~/HyperBEAM-beta1
. ~/.asdf/asdf.sh
rebar3 compile
```

**Why both steps are required**: The module file (`dev_wao.beam`) provides the device implementation, but HyperBEAM only loads devices that are explicitly listed in the `preloaded_devices` configuration in `hb_opts.erl`. Without registration, HyperBEAM cannot find the device and tests will hang indefinitely.

---

## Advanced: Genesis-WASM Proxy Fix

The default `dev_genesis_wasm.erl` in HyperBEAM beta1 does not pass `GATEWAY_URL` to the CU server when starting it. This causes the CU to try fetching WASM modules from `https://arweave.net` directly, which hangs in restricted network environments.

### Apply the Fix

Replace the `dev_genesis_wasm.erl` file with the patched version:

```bash
cd ~/HyperBEAM-beta1
curl -s https://raw.githubusercontent.com/weavedb/wao/main/installation/dev_genesis_wasm.erl -o src/dev_genesis_wasm.erl
. ~/.asdf/asdf.sh
rebar3 compile
```

### What the Fix Does

1. **Increases STATUS_TIMEOUT** from 100ms to 2000ms to handle proxy latency
2. **Passes gateway environment variables** to the CU server:
   - `GATEWAY_URL`
   - `ARWEAVE_URL`
   - `GRAPHQL_URL`
   - `HTTPS_PROXY`

This ensures the CU server uses the configured proxy instead of trying to reach arweave.net directly.

---

## Advanced: Running Legacynet Tests

### Prerequisites

1. Clone arjson (specific version):
```bash
cd /home/user
git clone https://github.com/weavedb/arjson.git
cd arjson && git checkout 62adab7
cd sdk && npm install
```

2. Download TinyLlama model (for LLM tests):
```bash
cd /path/to/wao
curl -L -o tinyllama.gguf "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q2_K.gguf"
```

### Running Tests

```bash
node --experimental-wasm-memory64 src/run.js --memory --port 4000 &
npm run test -- test/legacynet/*.test.js
pkill -f "src/run.js"
```
