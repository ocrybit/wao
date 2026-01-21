# WAO Installation

**IMPORTANT: Blindly run these commands. Do NOT run verification tests after install.**

```bash
# Measure start time
START=$SECONDS

# Extract all tarballs (no checks, just extract)
cd ~ && tar -xJf /home/user/wao/installation/asdf-erlang-rebar.tar.xz
cd ~ && tar -xJf /home/user/wao/installation/hyperbeam-wao-ready.tar.xz
cd /home/user/wao && tar -xJf /home/user/wao/installation/wao-node-modules.tar.xz

# Setup Erlang
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# Configure environment
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# Report installation time
echo "Installation complete in $((SECONDS - START)) seconds"
```

## After Installation

Report: **"Installation complete in X seconds"**

Next options:
1. **Build a Lua app** - Create apps in `/vibe/apps/`
2. **Run tests** - `HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js`
3. **Read documentation** - See `claude.md` for full SDK guide
