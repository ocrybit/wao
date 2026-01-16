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
