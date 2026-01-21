# WAO Installation

```bash
# 1. Extract tarballs (Erlang, HyperBEAM, node_modules)
cd ~ && tar -xJf /home/user/wao/installation/asdf-erlang-rebar.tar.xz
cd ~ && tar -xJf /home/user/wao/installation/hyperbeam-wao-ready.tar.xz
cd /home/user/wao && tar -xJf installation/wao-node-modules.tar.xz

# 2. Setup Erlang
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# 3. Configure environment
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF
```

See `claude.md` for full documentation.
