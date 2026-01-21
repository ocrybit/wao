# WAO Installation Guide

## Quick Setup (5 min)

```bash
# 1. Clone and install
git clone https://github.com/weavedb/wao.git && cd wao
npm install

# 2. Build hbsig
cd hbsig && npm install && npm run build && cd ..
npm install

# 3. Setup Erlang (via asdf)
git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0
. ~/.asdf/asdf.sh && echo '. ~/.asdf/asdf.sh' >> ~/.bashrc
asdf plugin add erlang && asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git
asdf install erlang 27.3.4.6 && asdf global erlang 27.3.4.6
asdf install rebar 3.26.0 && asdf global rebar 3.26.0

# 4. Setup HyperBEAM
git clone --depth 1 --branch v0.9-milestone-3-beta-3 https://github.com/permaweb/HyperBEAM.git ~/HyperBEAM
cd ~/HyperBEAM && rebar3 compile

# 5. Environment
cat > ~/wao/.env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# 6. Verify
cd ~/wao
HB_TIMEOUT=60 node --test --test-concurrency=1 test/hyperbeam/hb-success-beta3/simple.test.js
```

## Test Commands

```bash
# HyperBEAM tests (30 tests)
HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js

# All beta3 tests
HB_TIMEOUT=60 node --test --test-concurrency=1 test/hyperbeam/hb-success-beta3/*.test.js

# In-memory tests (ArMem)
npm test
```

## Key Flags

| Flag | Purpose |
|------|---------|
| `HB_TIMEOUT=60` | Auto-kill HyperBEAM after N seconds (prevents hangs) |
| `--test-concurrency=1` | Run tests sequentially (prevents port conflicts) |
| `HB_REBAR3=false` | Use direct erl mode (mandatory) |

## Troubleshooting

**Tests hang forever:**
```bash
export HB_REBAR3=false  # Must be set
pkill -9 -f beam.smp    # Kill stuck HyperBEAM
```

**Port 10001 in use:**
```bash
pkill -9 -f beam.smp && pkill -9 -f epmd
```

**hbsig not found:**
```bash
cd hbsig && npm install && npm run build && cd .. && npm install
```
