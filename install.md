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

# 2. Install WAO dependencies and build hbsig
cd /path/to/wao
npm install
cd hbsig && yarn install && yarn build && cd ..
npm install  # Re-install to link local hbsig

# 3. Run tests (ALWAYS use HB_REBAR3=false and set ARWEAVE_GATEWAY)
ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev" HB_REBAR3=false node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/simple.test.js
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

## Step 3: Install WAO Dependencies (MANDATORY)

### Install npm Dependencies

```bash
cd /path/to/wao
npm install
```

### Build Local hbsig Package (MANDATORY)

The local hbsig package MUST be built before running tests. HyperBEAM beta1 requires a patched version of hbsig with `sig-` prefix (instead of `http-sig-`).

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

### Create/Copy Wallet File

```bash
# Copy from existing HyperBEAM installation
cp ~/HyperBEAM-beta1/.wallet.json /path/to/wao/.wallet.json

# Or ensure one exists in HyperBEAM directory
ls ~/HyperBEAM-beta1/.wallet.json
```

### Set Environment Variables (Optional)

```bash
# HyperBEAM installation path (defaults to ~/HyperBEAM-beta1)
export CWD=~/HyperBEAM-beta1

# Arweave gateway for proxy environments
export ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev"
```

---

## Step 5: Running Tests

### CRITICAL: Always Use HB_REBAR3=false and ARWEAVE_GATEWAY

**NEVER run tests without `HB_REBAR3=false`**. The rebar3 shell mode hangs indefinitely in most environments.

**ALWAYS set `ARWEAVE_GATEWAY`** to ensure tests work in all network environments.

### Correct Test Command

```bash
ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev" HB_REBAR3=false node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/simple.test.js
```

### Run All hb-success Tests

```bash
ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev" HB_REBAR3=false node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/
```

### Run Specific Test File

```bash
ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev" HB_REBAR3=false node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/meta.test.js
```

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

For environments where direct Arweave access is blocked:

```bash
export ARWEAVE_GATEWAY="https://arweave-proxy.ocrybit.workers.dev"
HB_REBAR3=false node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/simple.test.js
```

Or in code:
```javascript
new HyperBEAM({ arweave_gateway: "https://arweave-proxy.ocrybit.workers.dev" })
```

---

## Troubleshooting

### Tests Hang Forever

**Cause**: Using rebar3 mode (default) which blocks indefinitely.

**Solution**: Always use `HB_REBAR3=false`:
```bash
HB_REBAR3=false node --experimental-wasm-memory64 --test --test-concurrency=1 ...
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

| Variable | Description | Default |
|----------|-------------|---------|
| `ARWEAVE_GATEWAY` | Arweave proxy URL (MANDATORY) | Use `https://arweave-proxy.ocrybit.workers.dev` |
| `HB_REBAR3` | Use rebar3 mode (`true`/`false`) | `true` (BUT USE `false`!) |
| `CWD` | HyperBEAM installation directory | `~/HyperBEAM-beta1` |

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
- [ ] Wallet file exists (`~/HyperBEAM-beta1/.wallet.json`)
- [ ] Tests run with `HB_REBAR3=false`

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
HB_REBAR3=false node --experimental-wasm-memory64 --test --test-concurrency=1 test/hyperbeam/hb-success/upload.test.js
```

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
