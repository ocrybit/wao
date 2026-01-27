# HyperBEAM Setup Guide

This guide explains how to install HyperBEAM from the submodule and run tests.

## Prerequisites

The installation uses pre-built tarballs located in `wao-hb/claude/installation/`:
- `asdf-erlang-rebar.tar.xz` - Erlang 27.3.4.6 and Rebar3 3.26.0
- `hyperbeam-wao-ready.tar.xz` - Pre-built HyperBEAM dependencies and NIFs
- `hyperbeam_rebar.config` - Offline rebar configuration

## Installation Steps

### Step 1: Extract Erlang and setup asdf

```bash
cd ~ && tar -xJf /home/user/wao-hb/claude/installation/asdf-erlang-rebar.tar.xz
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0
```

### Step 2: Initialize the HyperBEAM submodule

```bash
cd /home/user/wao
git submodule update --init --recursive
```

### Step 3: Extract pre-built dependencies

```bash
cd /tmp && tar -xJf /home/user/wao-hb/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/_build
cp -r /tmp/HyperBEAM/_build /home/user/wao/HyperBEAM/
rm -rf /tmp/HyperBEAM
```

### Step 4: Configure rebar for offline compilation

```bash
cd /home/user/wao/HyperBEAM
rm -f rebar.lock
cp /home/user/wao-hb/claude/installation/hyperbeam_rebar.config rebar.config
```

### Step 5: Compile HyperBEAM

```bash
cd /home/user/wao/HyperBEAM
rm -rf _build/wamr/lib/CMakeCache.txt _build/wamr/lib/CMakeFiles
. ~/.asdf/asdf.sh && rebar3 compile
```

### Step 6: Extract pre-built NIFs

```bash
cd /tmp && tar -xJf /home/user/wao-hb/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/priv
cp -r /tmp/HyperBEAM/priv/* /home/user/wao/HyperBEAM/priv/
mkdir -p /home/user/wao/HyperBEAM/_build/default/lib/hb/priv
cp -r /tmp/HyperBEAM/priv/* /home/user/wao/HyperBEAM/_build/default/lib/hb/priv/
rm -rf /tmp/HyperBEAM
```

### Step 7: Extract wallet file

```bash
cd /tmp && tar -xJf /home/user/wao-hb/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/.wallet.json
cp /tmp/HyperBEAM/.wallet.json /home/user/wao/HyperBEAM/
rm -rf /tmp/HyperBEAM
```

### Step 8: Create symlink for tests

```bash
ln -sfn /home/user/wao/HyperBEAM ~/HyperBEAM
```

### Step 9: Configure environment

```bash
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF
```

### Step 10: Build and link hbsig

```bash
cd /home/user/wao/hbsig && npm install && npm run build
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig
```

## Verification

Check the installation:

```bash
cd ~/HyperBEAM
echo "Beam files: $(ls _build/default/lib/hb/ebin/*.beam | wc -l)"
echo "NIFs: $(ls priv/*.so)"
echo "WASM: $(ls _build/wamr/lib/libvmlib.a && echo OK)"
```

Expected output:
```
Beam files: 150
NIFs: priv/hb_beamr.so priv/hb_keccak.so
WASM: OK
```

## Running Tests

### hbsig tests

```bash
cd /home/user/wao

# ID test (no HyperBEAM needed)
node --experimental-wasm-memory64 --test hbsig/test/id.test.js

# Commit test (requires HyperBEAM)
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js
```

### General test commands

| Test | Command |
|------|---------|
| hbsig ID test | `node --experimental-wasm-memory64 --test hbsig/test/id.test.js` |
| hbsig commit test | `. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/commit.test.js` |
| All hbsig tests | `. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --experimental-wasm-memory64 --test hbsig/test/*.test.js` |

## Troubleshooting

### "spawn rebar3 ENOENT"
Load asdf before running tests:
```bash
. ~/.asdf/asdf.sh
```

### "Package not found in any repo: luerl"
Apply the offline rebar config:
```bash
cp /home/user/wao-hb/claude/installation/hyperbeam_rebar.config /home/user/wao/HyperBEAM/rebar.config
rm -f /home/user/wao/HyperBEAM/rebar.lock
```

### "Cannot find module hbsig"
Rebuild and relink hbsig:
```bash
cd /home/user/wao/hbsig && npm run build
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig
```

### Tests hang or timeout
Kill stuck processes:
```bash
pkill -9 -f beam.smp; pkill -9 -f epmd
```

### CMake cache error
Clear CMake cache and recompile:
```bash
cd /home/user/wao/HyperBEAM
rm -rf _build/wamr/lib/CMakeCache.txt _build/wamr/lib/CMakeFiles
. ~/.asdf/asdf.sh && rebar3 compile
```

## Quick Start Script

Run all setup steps at once:

```bash
#!/bin/bash
set -e

# Step 1: Erlang
cd ~ && tar -xJf /home/user/wao-hb/claude/installation/asdf-erlang-rebar.tar.xz
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# Step 2: Submodule
cd /home/user/wao && git submodule update --init --recursive

# Step 3: Dependencies
cd /tmp && tar -xJf /home/user/wao-hb/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/_build
cp -r /tmp/HyperBEAM/_build /home/user/wao/HyperBEAM/
rm -rf /tmp/HyperBEAM

# Step 4: Rebar config
cd /home/user/wao/HyperBEAM && rm -f rebar.lock
cp /home/user/wao-hb/claude/installation/hyperbeam_rebar.config rebar.config

# Step 5: Compile
rm -rf _build/wamr/lib/CMakeCache.txt _build/wamr/lib/CMakeFiles
rebar3 compile

# Step 6: NIFs
cd /tmp && tar -xJf /home/user/wao-hb/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/priv
cp -r /tmp/HyperBEAM/priv/* /home/user/wao/HyperBEAM/priv/
mkdir -p /home/user/wao/HyperBEAM/_build/default/lib/hb/priv
cp -r /tmp/HyperBEAM/priv/* /home/user/wao/HyperBEAM/_build/default/lib/hb/priv/
rm -rf /tmp/HyperBEAM

# Step 7: Wallet
cd /tmp && tar -xJf /home/user/wao-hb/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/.wallet.json
cp /tmp/HyperBEAM/.wallet.json /home/user/wao/HyperBEAM/
rm -rf /tmp/HyperBEAM

# Step 8: Symlink
ln -sfn /home/user/wao/HyperBEAM ~/HyperBEAM

# Step 9: Environment
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# Step 10: hbsig
cd /home/user/wao/hbsig && npm install && npm run build
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig

echo "Setup complete!"
```
